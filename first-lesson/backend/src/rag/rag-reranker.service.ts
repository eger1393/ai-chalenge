import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import { AutoTokenizer, env, XLMRobertaModel } from '@huggingface/transformers';
import { RAG_RERANKER_DTYPE, RAG_RERANKER_MODEL_ID } from './constants';
import { RagChunkMatch } from './rag.types';

type RagRerankerTokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type RagRerankerModel = Awaited<ReturnType<typeof XLMRobertaModel.from_pretrained>>;

@Injectable()
export class RagRerankerService {
  private readonly logger = new Logger(RagRerankerService.name);
  private artifactsPromise: Promise<{ tokenizer: RagRerankerTokenizer; model: RagRerankerModel }> | null = null;

  constructor() {
    env.allowRemoteModels = true;
    env.cacheDir = process.env.HF_HOME ?? path.resolve(process.cwd(), '.cache', 'huggingface');
  }

  async rerank(
    query: string,
    matches: RagChunkMatch[],
    traceId = 'rag-reranker',
  ): Promise<RagChunkMatch[]> {
    if (matches.length === 0) {
      this.logger.log(`[${traceId}] Reranker пропущен: нет кандидатов`);
      return [];
    }

    this.logger.log(
      `[${traceId}] Reranker начал оценку кандидатов: model=${RAG_RERANKER_MODEL_ID}, dtype=${RAG_RERANKER_DTYPE}, queryChars=${query.length}, candidates=${matches.length}`,
    );

    const { tokenizer, model } = await this.getArtifacts();
    const inputs = await tokenizer(new Array(matches.length).fill(query), {
      text_pair: matches.map((match) => match.content),
      padding: true,
      truncation: true,
    });
    const outputs = await model(inputs);
    const rerankerScores = await extractPositiveScores(outputs.logits);

    if (rerankerScores.length !== matches.length) {
      throw new Error(
        `Число оценок reranker (${rerankerScores.length}) не совпадает с числом кандидатов (${matches.length})`,
      );
    }

    const reranked = matches.map((match, index) => {
      const rerankerScore = rerankerScores[index] ?? 0;

      this.logger.log(
        `[${traceId}] Reranker score ${JSON.stringify({
          chunkId: match.chunkId,
          documentId: match.documentId,
          externalId: match.document.externalId,
          chunkIndex: match.chunkIndex,
          similarity: roundForLog(match.similarity),
          rerankerScore: roundForLog(rerankerScore),
          chunkChars: match.content.length,
          preview: truncateForLog(match.content),
        })}`,
      );

      return {
        ...match,
        rankingScore: rerankerScore,
        rerankerScore,
      };
    });

    this.logger.log(
      `[${traceId}] Reranker завершил оценку: processed=${reranked.length}`,
    );

    return reranked;
  }

  private async getArtifacts(): Promise<{ tokenizer: RagRerankerTokenizer; model: RagRerankerModel }> {
    if (!this.artifactsPromise) {
      this.logger.log(
        `Загрузка reranker-модели ${RAG_RERANKER_MODEL_ID} (dtype=${RAG_RERANKER_DTYPE})`,
      );
      this.artifactsPromise = Promise.all([
        AutoTokenizer.from_pretrained(RAG_RERANKER_MODEL_ID),
        XLMRobertaModel.from_pretrained(RAG_RERANKER_MODEL_ID, {
          dtype: RAG_RERANKER_DTYPE,
        }),
      ]).then(([tokenizer, model]) => ({ tokenizer, model }));
    }

    try {
      return await this.artifactsPromise;
    } catch (error) {
      this.artifactsPromise = null;
      throw error;
    }
  }
}

function roundForLog(value: number): number {
  return Number(value.toFixed(4));
}

function truncateForLog(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

async function extractPositiveScores(logits: { tolist(): Promise<unknown> | unknown }): Promise<number[]> {
  const raw = await logits.tolist();
  const rows = normalizeLogitRows(raw);
  return rows.map((row) => sigmoid(row[0] ?? 0));
}

function normalizeLogitRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length === 0) {
    return [];
  }

  if (typeof value[0] === 'number') {
    return [value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))];
  }

  return value.map((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    return row.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  });
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
