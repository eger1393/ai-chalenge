import type { DocsRagConfig } from '../domain/config.js';
import { rankHybridResults, type SearchResult } from '../domain/search.js';
import type { EmbeddingProvider } from './embed-chunks.js';

export interface LexicalSearchRepository {
  searchLexical(projectRoot: string, query: string, limit: number): Promise<SearchResult[]>;
}

export interface VectorSearchRepository {
  searchVector(projectRoot: string, queryVector: number[], model: string, limit: number): Promise<SearchResult[]>;
}

export async function queryDocuments(
  repository: LexicalSearchRepository & VectorSearchRepository,
  embeddingProvider: EmbeddingProvider,
  projectRoot: string,
  config: DocsRagConfig,
  query: string,
  maxChunks?: number,
): Promise<SearchResult[]> {
  const limit = maxChunks ?? config.retrieval.topK;
  const candidateLimit = Math.max(limit * 3, limit);
  const [lexicalResults, queryEmbedding] = await Promise.all([
    repository.searchLexical(projectRoot, query, candidateLimit),
    embeddingProvider.embedTexts([query], config.embeddings.model),
  ]);
  const vectorResults = await repository.searchVector(projectRoot, queryEmbedding[0] ?? [], config.embeddings.model, candidateLimit);

  return rankHybridResults(
    lexicalResults,
    vectorResults,
    config.retrieval.lexicalWeight,
    config.retrieval.vectorWeight,
    limit,
  );
}
