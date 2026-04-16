export const RAG_SOURCE_MODEL_ID = 'BAAI/bge-m3';
export const RAG_RUNTIME_MODEL_ID = 'Xenova/bge-m3';
export const RAG_RERANKER_MODEL_ID = 'jinaai/jina-reranker-v2-base-multilingual';
export const RAG_RERANKER_DTYPE = 'q4';
export const RAG_QUERY_REWRITE_MODEL = 'gpt-4.1-nano';
export const RAG_QUERY_REWRITE_MAX_TOKENS = 128;
export const RAG_EMBEDDING_DIMENSION = 1024;
export const RAG_DEFAULT_CANDIDATE_POOL = 12;
export const RAG_DEFAULT_TOP_K = 5;
export const RAG_DEFAULT_MAX_CONTEXT_CHARS = 5000;
export const RAG_DEFAULT_SOURCE_TYPE = 'telegram_channel';
export const RAG_DEFAULT_MAX_MATCHES_PER_DOCUMENT = 2;
export const RAG_FILTER_STRONG_SIMILARITY = 0.42;
export const RAG_FILTER_BASE_SIMILARITY = 0.35;
export const RAG_FILTER_TOKEN_MATCH_WEIGHT = 0.05;
export const RAG_RERANKER_MIN_SIMILARITY = 0.2;
export const RAG_RERANKER_MIN_SCORE = 0.4;

export const ALLOWED_RAG_MODES = ['filter', 'reranker'] as const;
export type RagMode = (typeof ALLOWED_RAG_MODES)[number];
export const DEFAULT_RAG_MODE: RagMode = 'filter';

export function isRagMode(value: unknown): value is RagMode {
  return typeof value === 'string' && (ALLOWED_RAG_MODES as readonly string[]).includes(value);
}

export function normalizeRagMode(value: unknown): RagMode {
  return isRagMode(value) ? value : DEFAULT_RAG_MODE;
}
