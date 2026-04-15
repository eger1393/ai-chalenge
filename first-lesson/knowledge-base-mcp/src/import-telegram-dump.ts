import fs from 'node:fs/promises';
import path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import type pg from 'pg';
import { initDb, withTransaction } from './db.js';

const SOURCE_MODEL_ID = 'BAAI/bge-m3';
const RUNTIME_MODEL_ID = 'Xenova/bge-m3';
const EMBEDDING_DIMENSION = 1024;
const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 200;
const DEFAULT_BATCH_SIZE = 8;

interface CliOptions {
  dumpPath: string;
  maxChars: number;
  overlapChars: number;
  batchSize: number;
}

interface TelegramDump {
  name: string;
  id: number | string;
  messages: TelegramMessage[];
}

interface TelegramMessage {
  id: number | string;
  type: string;
  date?: string;
  edited?: string;
  text?: unknown;
  media_type?: string;
  photo?: unknown;
  file?: unknown;
  thumbnail?: unknown;
  from?: string;
  from_id?: string;
  views?: number;
  forwards?: number;
  reply_to_message_id?: number;
  [key: string]: unknown;
}

interface PreparedChunk {
  chunkIndex: number;
  content: string;
  charCount: number;
  embedding: number[];
  metadata: Record<string, unknown>;
}

interface ImportStats {
  totalMessages: number;
  storedMessages: number;
  chunkedMessages: number;
  storedChunks: number;
  emptyMessages: number;
  serviceMessages: number;
}

type JsonRecord = Record<string, unknown>;

class BgeM3Embedder {
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(private readonly runtimeModelId: string) {
    env.allowRemoteModels = true;
    env.cacheDir = process.env.HF_HOME ?? path.resolve(process.cwd(), '.cache', 'huggingface');
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline('feature-extraction', this.runtimeModelId, {
        dtype: 'fp32',
      }) as Promise<FeatureExtractionPipeline>;
    }

    return this.extractorPromise;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getExtractor();
    const output = await extractor(texts, {
      pooling: 'cls',
      normalize: true,
    });

    const rows = normalizeTensorRows(output.tolist());
    rows.forEach((row, index) => {
      if (row.length !== EMBEDDING_DIMENSION) {
        throw new Error(
          `Модель ${this.runtimeModelId} вернула embedding длиной ${row.length} для чанка ${index}, ожидалось ${EMBEDDING_DIMENSION}`,
        );
      }
    });

    return rows;
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  const positional: string[] = [];
  let maxChars = DEFAULT_MAX_CHARS;
  let overlapChars = DEFAULT_OVERLAP_CHARS;
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--max-chars') {
      maxChars = parseIntegerOption(argv[++index], '--max-chars');
      continue;
    }

    if (value === '--overlap-chars') {
      overlapChars = parseIntegerOption(argv[++index], '--overlap-chars');
      continue;
    }

    if (value === '--batch-size') {
      batchSize = parseIntegerOption(argv[++index], '--batch-size');
      continue;
    }

    positional.push(value);
  }

  if (positional.length === 0) {
    throw new Error(
      'Не указан путь к дампу Telegram. Пример: npm run import:telegram -- ../result.json',
    );
  }

  if (overlapChars >= maxChars) {
    throw new Error('Параметр overlap должен быть меньше размера чанка');
  }

  return {
    dumpPath: positional[0],
    maxChars,
    overlapChars,
    batchSize,
  };
}

function parseIntegerOption(value: string | undefined, optionName: string): number {
  if (!value) {
    throw new Error(`Для параметра ${optionName} нужно указать числовое значение`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Параметр ${optionName} должен быть положительным числом`);
  }

  return parsed;
}

function normalizeTensorRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    throw new Error('Не удалось преобразовать ответ модели в массив embeddings');
  }

  if (value.length === 0) {
    return [];
  }

  if (typeof value[0] === 'number') {
    return [value as number[]];
  }

  if (Array.isArray(value[0]) && typeof value[0][0] === 'number') {
    return value as number[][];
  }

  if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    return (value as unknown[][][]).map((item) => {
      if (!Array.isArray(item[0])) {
        throw new Error('Неожиданная форма тензора embeddings');
      }

      return item[0] as number[];
    });
  }

  throw new Error('Неожиданная форма тензора embeddings');
}

function extractMessageText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }

      return '';
    })
    .join('');
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasMedia(message: TelegramMessage): boolean {
  return Boolean(message.media_type || message.photo || message.file || message.thumbnail);
}

function splitLongBlock(block: string, maxChars: number, overlapChars: number): string[] {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < block.length) {
    let sliceEnd = Math.min(cursor + maxChars, block.length);

    if (sliceEnd < block.length) {
      const breakPoint = Math.max(
        block.lastIndexOf('\n', sliceEnd),
        block.lastIndexOf('. ', sliceEnd),
        block.lastIndexOf('! ', sliceEnd),
        block.lastIndexOf('? ', sliceEnd),
        block.lastIndexOf(' ', sliceEnd),
      );

      if (breakPoint > cursor + Math.floor(maxChars * 0.6)) {
        sliceEnd = breakPoint + 1;
      }
    }

    const chunk = block.slice(cursor, sliceEnd).trim();
    if (chunk) {
      parts.push(chunk);
    }

    if (sliceEnd >= block.length) {
      break;
    }

    cursor = Math.max(sliceEnd - overlapChars, cursor + 1);
  }

  return parts;
}

function buildChunks(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (block.length <= maxChars) {
      current = block;
      continue;
    }

    chunks.push(...splitLongBlock(block, maxChars, overlapChars));
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : splitLongBlock(text, maxChars, overlapChars);
}

function buildMessageMetadata(message: TelegramMessage): JsonRecord {
  return compactRecord({
    from: message.from,
    from_id: message.from_id,
    views: message.views,
    forwards: message.forwards,
    reply_to_message_id: message.reply_to_message_id,
    media_type: message.media_type,
    date: message.date,
    edited: message.edited,
    dump_message_type: message.type,
  });
}

function compactRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

function serializeVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function upsertTelegramMessage(
  client: pg.PoolClient,
  channelId: string,
  channelName: string,
  message: TelegramMessage,
  fullText: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO telegram_channel_messages (
        channel_id,
        channel_name,
        message_id,
        message_type,
        published_at,
        edited_at,
        full_text,
        has_media,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (channel_id, message_id) DO UPDATE
      SET channel_name = EXCLUDED.channel_name,
          message_type = EXCLUDED.message_type,
          published_at = EXCLUDED.published_at,
          edited_at = EXCLUDED.edited_at,
          full_text = EXCLUDED.full_text,
          has_media = EXCLUDED.has_media,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [
      channelId,
      channelName,
      String(message.id),
      message.type,
      message.date ?? null,
      message.edited ?? null,
      fullText,
      hasMedia(message),
      JSON.stringify(buildMessageMetadata(message)),
    ],
  );
}

async function replaceTelegramChunks(
  client: pg.PoolClient,
  channelId: string,
  messageId: string,
  chunks: PreparedChunk[],
): Promise<void> {
  await client.query(
    'DELETE FROM telegram_message_chunks WHERE channel_id = $1 AND message_id = $2',
    [channelId, messageId],
  );

  for (const chunk of chunks) {
    await client.query(
      `
        INSERT INTO telegram_message_chunks (
          channel_id,
          message_id,
          chunk_index,
          content,
          char_count,
          embedding_model,
          embedding,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
      `,
      [
        channelId,
        messageId,
        chunk.chunkIndex,
        chunk.content,
        chunk.charCount,
        RUNTIME_MODEL_ID,
        serializeVector(chunk.embedding),
        JSON.stringify(chunk.metadata),
      ],
    );
  }
}

async function storeMessageAndChunks(
  channelId: string,
  channelName: string,
  message: TelegramMessage,
  fullText: string,
  chunks: PreparedChunk[],
): Promise<void> {
  await withTransaction(async (client) => {
    await upsertTelegramMessage(client, channelId, channelName, message, fullText);
    await replaceTelegramChunks(client, channelId, String(message.id), chunks);
  });
}

async function loadDump(filePath: string): Promise<TelegramDump> {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<TelegramDump>;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
    throw new Error('Файл дампа Telegram имеет неожиданный формат');
  }

  if (parsed.id == null || !parsed.name) {
    throw new Error('В дампе Telegram отсутствуют id или имя канала');
  }

  return parsed as TelegramDump;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const dump = await loadDump(options.dumpPath);
  const embedder = new BgeM3Embedder(RUNTIME_MODEL_ID);

  await initDb();

  const stats: ImportStats = {
    totalMessages: dump.messages.length,
    storedMessages: 0,
    chunkedMessages: 0,
    storedChunks: 0,
    emptyMessages: 0,
    serviceMessages: 0,
  };

  const channelId = String(dump.id);
  const channelName = dump.name;

  console.log(`Импорт канала "${channelName}" (${channelId}) из ${path.resolve(options.dumpPath)}`);

  for (let start = 0; start < dump.messages.length; start += options.batchSize) {
    const batch = dump.messages.slice(start, start + options.batchSize);

    for (const message of batch) {
      const normalizedText = normalizeText(extractMessageText(message.text));
      const chunkContents =
        message.type === 'message' && normalizedText
          ? buildChunks(normalizedText, options.maxChars, options.overlapChars)
          : [];

      if (message.type === 'service') {
        stats.serviceMessages += 1;
      }

      if (!normalizedText) {
        stats.emptyMessages += 1;
      }

      const embeddings = chunkContents.length > 0
        ? await embedder.embedMany(chunkContents)
        : [];

      const chunks: PreparedChunk[] = chunkContents.map((content, chunkIndex) => ({
        chunkIndex,
        content,
        charCount: content.length,
        embedding: embeddings[chunkIndex],
        metadata: compactRecord({
          channel_id: channelId,
          message_id: String(message.id),
          chunk_index: chunkIndex,
          total_chunks: chunkContents.length,
          date: message.date,
          edited: message.edited,
          has_media: hasMedia(message),
          source_model: SOURCE_MODEL_ID,
          runtime_model: RUNTIME_MODEL_ID,
        }),
      }));

      await storeMessageAndChunks(
        channelId,
        channelName,
        message,
        normalizedText,
        chunks,
      );

      stats.storedMessages += 1;
      stats.storedChunks += chunks.length;
      if (chunks.length > 0) {
        stats.chunkedMessages += 1;
      }
    }

    const processed = Math.min(start + batch.length, dump.messages.length);
    console.log(`Обработано сообщений: ${processed}/${dump.messages.length}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        channel_id: channelId,
        channel_name: channelName,
        embedding_source_model: SOURCE_MODEL_ID,
        embedding_runtime_model: RUNTIME_MODEL_ID,
        chunk_max_chars: options.maxChars,
        chunk_overlap_chars: options.overlapChars,
        ...stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error(`Импорт Telegram завершился с ошибкой: ${message}`);
  process.exit(1);
});
