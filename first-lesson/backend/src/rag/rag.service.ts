import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_RAG_MODE,
  RAG_DEFAULT_CANDIDATE_POOL,
  RAG_DEFAULT_MAX_CONTEXT_CHARS,
  RAG_DEFAULT_MAX_MATCHES_PER_DOCUMENT,
  RAG_DEFAULT_TOP_K,
  RAG_FILTER_BASE_SIMILARITY,
  RAG_FILTER_STRONG_SIMILARITY,
  RAG_FILTER_TOKEN_MATCH_WEIGHT,
  RAG_RERANKER_MIN_SCORE,
  RAG_RERANKER_MIN_SIMILARITY,
  type RagMode,
} from './constants';
import { RagEmbeddingService } from './rag-embedding.service';
import { RagRerankerService } from './rag-reranker.service';
import { RagRepository } from './rag.repository';
import { RagChunkMatch, RagContextResult } from './rag.types';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly ragEmbeddingService: RagEmbeddingService,
    private readonly ragRepository: RagRepository,
    private readonly ragRerankerService: RagRerankerService,
  ) {}

  async buildContextBlock(query: string, mode: RagMode = DEFAULT_RAG_MODE): Promise<RagContextResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        block: '',
        mode,
        scoreType: mode === 'reranker' ? 'reranker' : 'heuristic',
        candidateCount: 0,
        selectedCount: 0,
        matches: [],
      };
    }

    const selectedTopK = parseIntegerEnv('RAG_TOP_K', RAG_DEFAULT_TOP_K);
    const candidatePool = Math.max(
      parseIntegerEnv('RAG_CANDIDATE_POOL', RAG_DEFAULT_CANDIDATE_POOL),
      selectedTopK,
    );
    const maxContextChars = parseIntegerEnv('RAG_MAX_CONTEXT_CHARS', RAG_DEFAULT_MAX_CONTEXT_CHARS);
    const traceId = createRagTraceId();

    this.logger.log(
      `[${traceId}] RAG retrieval start ${JSON.stringify({
        mode,
        queryChars: normalizedQuery.length,
        queryPreview: truncateForLog(normalizedQuery),
        topK: selectedTopK,
        candidatePool,
        maxContextChars,
      })}`,
    );

    const queryEmbedding = await this.ragEmbeddingService.embedQuery(normalizedQuery);
    const rawMatches = await this.ragRepository.searchRelevantChunks(queryEmbedding, candidatePool);
    this.logMatches(traceId, 'Vector search candidates', rawMatches);
    const rankedMatches =
      mode === 'reranker'
        ? await this.applyReranker(normalizedQuery, rawMatches, traceId)
        : this.applyHeuristicFilter(normalizedQuery, rawMatches);
    const matches = this.limitMatchesPerDocument(
      traceId,
      rankedMatches,
      selectedTopK,
      RAG_DEFAULT_MAX_MATCHES_PER_DOCUMENT,
    );

    if (matches.length === 0) {
      this.logger.log(
        `[${traceId}] RAG retrieval finished without selected matches ${JSON.stringify({
          mode,
          candidateCount: rawMatches.length,
          rankedCount: rankedMatches.length,
        })}`,
      );
      return {
        block: '',
        mode,
        scoreType: mode === 'reranker' ? 'reranker' : 'heuristic',
        candidateCount: rawMatches.length,
        selectedCount: 0,
        matches: [],
      };
    }

    this.logger.log(
      `[${traceId}] RAG retrieval selected matches ${JSON.stringify({
        mode,
        candidateCount: rawMatches.length,
        rankedCount: rankedMatches.length,
        selectedCount: matches.length,
      })}`,
    );

    return {
      block: this.formatMatches(traceId, matches, maxContextChars),
      mode,
      scoreType: mode === 'reranker' ? 'reranker' : 'heuristic',
      candidateCount: rawMatches.length,
      selectedCount: matches.length,
      matches,
    };
  }

  private applyHeuristicFilter(query: string, matches: RagChunkMatch[]): RagChunkMatch[] {
    const queryTokens = extractMeaningfulTokens(query);
    const filteredMatches: RagChunkMatch[] = [];

    for (const match of matches) {
      const tokenOverlapCount = countTokenOverlap(
        queryTokens,
        extractMeaningfulTokens(match.content),
      );
      const passes =
        match.similarity >= RAG_FILTER_STRONG_SIMILARITY ||
        (match.similarity >= RAG_FILTER_BASE_SIMILARITY && tokenOverlapCount >= 1) ||
        tokenOverlapCount >= 2;

      if (!passes) {
        continue;
      }

      const rankingScore =
        match.similarity + Math.min(tokenOverlapCount, 3) * RAG_FILTER_TOKEN_MATCH_WEIGHT;

      filteredMatches.push({
        ...match,
        rankingScore,
        tokenOverlapCount,
      });
    }

    return filteredMatches.sort(compareByRank);
  }

  private async applyReranker(
    query: string,
    matches: RagChunkMatch[],
    traceId: string,
  ): Promise<RagChunkMatch[]> {
    this.logger.log(
      `[${traceId}] Reranker threshold check start ${JSON.stringify({
        minSimilarity: RAG_RERANKER_MIN_SIMILARITY,
        minScore: RAG_RERANKER_MIN_SCORE,
        candidates: matches.length,
      })}`,
    );

    const reranked = await this.ragRerankerService.rerank(query, matches, traceId);
    const sorted = reranked.sort(compareByRank);
    const selected: RagChunkMatch[] = [];

    for (const match of sorted) {
      const similarityPass = match.similarity >= RAG_RERANKER_MIN_SIMILARITY;
      const rerankerScore = match.rerankerScore ?? 0;
      const rerankerPass = rerankerScore >= RAG_RERANKER_MIN_SCORE;
      const passed = similarityPass && rerankerPass;

      this.logger.log(
        `[${traceId}] Reranker threshold decision ${JSON.stringify({
          ...buildMatchLogPayload(match),
          similarityThreshold: RAG_RERANKER_MIN_SIMILARITY,
          rerankerThreshold: RAG_RERANKER_MIN_SCORE,
          similarityPass,
          rerankerPass,
          passed,
          rejectionReasons: passed
            ? []
            : [
                ...(similarityPass ? [] : ['similarity_below_threshold']),
                ...(rerankerPass ? [] : ['reranker_score_below_threshold']),
              ],
        })}`,
      );

      if (passed) {
        selected.push(match);
      }
    }

    this.logger.log(
      `[${traceId}] Reranker threshold check finished ${JSON.stringify({
        inputCount: sorted.length,
        selectedCount: selected.length,
        rejectedCount: sorted.length - selected.length,
      })}`,
    );

    return selected;
  }

  private logMatches(traceId: string, label: string, matches: RagChunkMatch[]): void {
    this.logger.log(
      `[${traceId}] ${label} ${JSON.stringify({
        count: matches.length,
        matches: matches.map((match) => buildMatchLogPayload(match)),
      })}`,
    );
  }

  private limitMatchesPerDocument(
    traceId: string,
    matches: RagChunkMatch[],
    limit: number,
    maxPerDocument: number,
  ): RagChunkMatch[] {
    const selected: RagChunkMatch[] = [];
    const counts = new Map<string, number>();
    const skipped: Array<Record<string, unknown>> = [];

    for (const match of matches) {
      if (selected.length >= limit) {
        skipped.push({
          ...buildMatchLogPayload(match),
          reason: 'top_k_limit',
        });
        continue;
      }

      const currentCount = counts.get(match.documentId) ?? 0;
      if (currentCount >= maxPerDocument) {
        skipped.push({
          ...buildMatchLogPayload(match),
          reason: 'document_limit',
          maxPerDocument,
        });
        continue;
      }

      counts.set(match.documentId, currentCount + 1);
      selected.push(match);
    }

    this.logger.log(
      `[${traceId}] Context selection result ${JSON.stringify({
        limit,
        maxPerDocument,
        selected: selected.map((match) => buildMatchLogPayload(match)),
        skipped,
      })}`,
    );

    return selected;
  }

  private formatMatches(traceId: string, matches: RagChunkMatch[], maxContextChars: number): string {
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
        this.logger.log(
          `[${traceId}] RAG context char limit reached ${JSON.stringify({
            maxContextChars,
            usedChars,
            skippedFromRank: index + 1,
            skippedChunk: buildMatchLogPayload(match),
          })}`,
        );
        break;
      }

      sections.push(section);
      usedChars += section.length;
    }

    if (sections.length === 0) {
      return '';
    }

    this.logger.log(
      `[${traceId}] RAG context block assembled ${JSON.stringify({
        sectionCount: sections.length,
        totalChars: usedChars,
      })}`,
    );

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

function compareByRank(left: RagChunkMatch, right: RagChunkMatch): number {
  const leftScore = left.rankingScore ?? 0;
  const rightScore = right.rankingScore ?? 0;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return right.similarity - left.similarity;
}

function countTokenOverlap(queryTokens: Set<string>, chunkTokens: Set<string>): number {
  let overlap = 0;

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function extractMeaningfulTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
  );
}

const STOPWORDS = new Set([
  'это',
  'как',
  'так',
  'для',
  'что',
  'или',
  'при',
  'без',
  'под',
  'над',
  'про',
  'его',
  'она',
  'они',
  'если',
  'когда',
  'пока',
  'только',
  'быть',
  'есть',
  'был',
  'была',
  'были',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'you',
  'your',
  'about',
  'into',
]);

function createRagTraceId(): string {
  return `rag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncateForLog(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function roundForLog(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

function buildMatchLogPayload(match: RagChunkMatch): Record<string, unknown> {
  return {
    chunkId: match.chunkId,
    documentId: match.documentId,
    externalId: match.document.externalId,
    chunkIndex: match.chunkIndex,
    sourceKey: match.document.sourceKey,
    similarity: roundForLog(match.similarity),
    rankingScore: roundForLog(match.rankingScore),
    rerankerScore: roundForLog(match.rerankerScore),
    tokenOverlapCount: match.tokenOverlapCount ?? null,
    preview: truncateForLog(match.content),
  };
}
