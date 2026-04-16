import type { RagMode } from './constants';

export type RagQueryRewriteReason =
  | 'normalized_colloquial'
  | 'canonicalized_entity'
  | 'clarified_intent'
  | 'already_search_friendly'
  | 'ambiguous_without_context';

export interface RagQueryRewriteDebug {
  enabled: boolean;
  applied: boolean;
  rawApplied: boolean;
  reason: RagQueryRewriteReason | null;
  originalQuery: string;
  rewrittenQuery: string;
  model: string | null;
}

export interface RagDocumentRecord {
  id: string;
  sourceType: string;
  sourceKey: string;
  externalId: string;
  publishedAt: Date | null;
  fullText: string;
  metadata: Record<string, unknown>;
}

export interface RagChunkMatch {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  rankingScore?: number;
  tokenOverlapCount?: number;
  rerankerScore?: number;
  metadata: Record<string, unknown>;
  document: RagDocumentRecord;
}

export interface RagContextResult {
  block: string;
  mode: RagMode;
  scoreType: 'heuristic' | 'reranker';
  candidateCount: number;
  selectedCount: number;
  queryRewrite: RagQueryRewriteDebug;
  matches: RagChunkMatch[];
}

export interface RagDebugReference {
  rank: number;
  chunkId: string;
  documentId: string;
  similarity: number;
  rankingScore?: number;
  tokenOverlapCount?: number;
  rerankerScore?: number;
}

export interface RagDebugContext {
  enabled: boolean;
  mode: RagMode;
  scoreType: 'heuristic' | 'reranker';
  candidateCount: number;
  matchCount: number;
  selectedCount: number;
  queryRewrite: RagQueryRewriteDebug;
  matches: RagDebugReference[];
}

export interface RagDebugChunkDetails {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  charCount: number;
  embeddingModel: string;
  chunkMetadata: Record<string, unknown>;
  sourceType: string;
  sourceKey: string;
  externalId: string;
  publishedAt: Date | null;
  fullText: string;
  documentMetadata: Record<string, unknown>;
}
