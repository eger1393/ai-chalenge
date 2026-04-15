import { Injectable } from '@nestjs/common';
import {
  RAG_DEFAULT_MAX_CONTEXT_CHARS,
  RAG_DEFAULT_MIN_SIMILARITY,
  RAG_DEFAULT_TOP_K,
} from './constants';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagRepository } from './rag.repository';
import { RagChunkMatch, RagContextResult } from './rag.types';

@Injectable()
export class RagService {
  constructor(
    private readonly ragEmbeddingService: RagEmbeddingService,
    private readonly ragRepository: RagRepository,
  ) {}

  async buildContextBlock(query: string): Promise<RagContextResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return { block: '', matches: [] };
    }

    const topK = parseIntegerEnv('RAG_TOP_K', RAG_DEFAULT_TOP_K);
    const minSimilarity = parseFloatEnv('RAG_MIN_SIMILARITY', RAG_DEFAULT_MIN_SIMILARITY);
    const maxContextChars = parseIntegerEnv('RAG_MAX_CONTEXT_CHARS', RAG_DEFAULT_MAX_CONTEXT_CHARS);

    const queryEmbedding = await this.ragEmbeddingService.embedQuery(normalizedQuery);
    const rawMatches = await this.ragRepository.searchRelevantChunks(queryEmbedding, topK);
    const matches = rawMatches.filter((match) => match.similarity >= minSimilarity);

    if (matches.length === 0) {
      return { block: '', matches: [] };
    }

    return {
      block: this.formatMatches(matches, maxContextChars),
      matches,
    };
  }

  private formatMatches(matches: RagChunkMatch[], maxContextChars: number): string {
    const sections: string[] = [];
    let usedChars = 0;

    for (const [index, match] of matches.entries()) {
      const sourceLabel = String(match.document.metadata.channel_name ?? match.document.sourceKey);
      const publishedAt = match.document.publishedAt?.toISOString() ?? 'unknown';
      const snippet = match.content.trim();
      const section =
        `[RAG ${index + 1}]\n` +
        `Источник: ${sourceLabel}\n` +
        `Сообщение: ${match.document.externalId}\n` +
        `Дата: ${publishedAt}\n` +
        `Релевантность: ${match.similarity.toFixed(3)}\n` +
        `Фрагмент:\n${snippet}`;

      if (usedChars > 0 && usedChars + section.length > maxContextChars) {
        break;
      }

      sections.push(section);
      usedChars += section.length;
    }

    if (sections.length === 0) {
      return '';
    }

    return [
      '═══ RAG-КОНТЕКСТ ИЗ ИНДЕКСИРОВАННЫХ МАТЕРИАЛОВ ═══',
      'Ниже приведены релевантные фрагменты из внешнего корпуса сообщений.',
      'Используй их только если они реально помогают ответить на текущий запрос пользователя.',
      'Если фрагменты не относятся к вопросу, не делай выводов на их основе.',
      '',
      sections.join('\n\n'),
      '═══════════════════════════════════════════════════',
    ].join('\n');
  }
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
