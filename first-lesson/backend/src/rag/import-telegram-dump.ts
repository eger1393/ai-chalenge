import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Pool } from 'pg';
import { RagEmbeddingService } from './rag-embedding.service';
import {
  RAG_DEFAULT_SOURCE_TYPE,
  RAG_RUNTIME_MODEL_ID,
  RAG_SOURCE_MODEL_ID,
} from './constants';

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

function getRequiredDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required');
  }
  return value;
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
    throw new Error('Не указан путь к дампу Telegram. Пример: npm run rag:import:telegram -- ../result.json');
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

async function loadDump(filePath: string): Promise<TelegramDump> {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<TelegramDump>;

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages) || parsed.id == null || !parsed.name) {
    throw new Error('Файл дампа Telegram имеет неожиданный формат');
  }

  return parsed as TelegramDump;
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
      if (typeof part === 'string') return part;
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

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
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

function serializeVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const dump = await loadDump(options.dumpPath);
  const pool = new Pool({ connectionString: getRequiredDatabaseUrl() });
  const embedder = new RagEmbeddingService();

  try {
    const sourceKey = String(dump.id);
    const sourceLabel = dump.name;

    console.log(`Переиндексация Telegram-дампа "${sourceLabel}" (${sourceKey})`);

    for (let start = 0; start < dump.messages.length; start += options.batchSize) {
      const batch = dump.messages.slice(start, start + options.batchSize);

      for (const message of batch) {
        const normalizedText = normalizeText(extractMessageText(message.text));
        const chunkContents =
          message.type === 'message' && normalizedText
            ? buildChunks(normalizedText, options.maxChars, options.overlapChars)
            : [];
        const embeddings = chunkContents.length > 0
          ? await embedder.embedMany(chunkContents)
          : [];

        await pool.query('BEGIN');
        try {
          const documentResult = await pool.query<{ id: string }>(
            `
              INSERT INTO rag_documents (
                source_type,
                source_key,
                external_id,
                published_at,
                full_text,
                metadata
              )
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
              ON CONFLICT (source_type, source_key, external_id) DO UPDATE
              SET published_at = EXCLUDED.published_at,
                  full_text = EXCLUDED.full_text,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
              RETURNING id
            `,
            [
              RAG_DEFAULT_SOURCE_TYPE,
              sourceKey,
              String(message.id),
              message.date ?? null,
              normalizedText,
              JSON.stringify(compactRecord({
                channel_name: sourceLabel,
                date: message.date,
                edited: message.edited,
                from: message.from,
                from_id: message.from_id,
                views: message.views,
                forwards: message.forwards,
                reply_to_message_id: message.reply_to_message_id,
                has_media: hasMedia(message),
                message_type: message.type,
              })),
            ],
          );

          const documentId = documentResult.rows[0]?.id;
          if (!documentId) {
            throw new Error(`Не удалось сохранить документ для сообщения ${message.id}`);
          }

          await pool.query('DELETE FROM rag_chunks WHERE document_id = $1', [documentId]);

          for (const [chunkIndex, content] of chunkContents.entries()) {
            const chunk: PreparedChunk = {
              chunkIndex,
              content,
              charCount: content.length,
              embedding: embeddings[chunkIndex],
              metadata: compactRecord({
                source_model: RAG_SOURCE_MODEL_ID,
                runtime_model: RAG_RUNTIME_MODEL_ID,
                channel_name: sourceLabel,
                message_id: String(message.id),
                chunk_index: chunkIndex,
                total_chunks: chunkContents.length,
                has_media: hasMedia(message),
              }),
            };

            await pool.query(
              `
                INSERT INTO rag_chunks (
                  document_id,
                  chunk_index,
                  content,
                  char_count,
                  embedding_model,
                  embedding,
                  metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)
              `,
              [
                documentId,
                chunk.chunkIndex,
                chunk.content,
                chunk.charCount,
                RAG_RUNTIME_MODEL_ID,
                serializeVector(chunk.embedding),
                JSON.stringify(chunk.metadata),
              ],
            );
          }

          await pool.query('COMMIT');
        } catch (error) {
          await pool.query('ROLLBACK');
          throw error;
        }
      }

      const processed = Math.min(start + batch.length, dump.messages.length);
      console.log(`Обработано сообщений: ${processed}/${dump.messages.length}`);
    }

    console.log(
      JSON.stringify(
        {
          status: 'ok',
          sourceType: RAG_DEFAULT_SOURCE_TYPE,
          sourceKey,
          sourceLabel,
          embeddingSourceModel: RAG_SOURCE_MODEL_ID,
          embeddingRuntimeModel: RAG_RUNTIME_MODEL_ID,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
  console.error(`Переиндексация Telegram завершилась с ошибкой: ${message}`);
  process.exit(1);
});
