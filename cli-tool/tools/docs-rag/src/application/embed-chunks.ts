import type { Chunk } from '../domain/document.js';

export interface EmbeddingProvider {
  embedTexts(texts: string[], model: string): Promise<number[][]>;
}

export interface ChunkEmbeddingStorage {
  listChunksMissingEmbeddings(projectRoot: string, model: string): Promise<Chunk[]>;
  saveChunkEmbeddings(projectRoot: string, embeddings: ChunkEmbedding[]): Promise<void>;
}

export interface ChunkEmbedding {
  chunkId: string;
  model: string;
  vector: number[];
}

export interface EmbedChunksResult {
  embedded: number;
  skipped: number;
}

export async function embedMissingChunks(
  storage: ChunkEmbeddingStorage,
  provider: EmbeddingProvider,
  projectRoot: string,
  model: string,
): Promise<EmbedChunksResult> {
  const chunks = await storage.listChunksMissingEmbeddings(projectRoot, model);

  if (chunks.length === 0) {
    return { embedded: 0, skipped: 0 };
  }

  const batchSize = 64;
  let embedded = 0;

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const vectors = await provider.embedTexts(batch.map((chunk) => chunk.content), model);
    await storage.saveChunkEmbeddings(projectRoot, vectors.map((vector, vectorIndex) => ({
      chunkId: batch[vectorIndex].id,
      model,
      vector,
    })));
    embedded += vectors.length;
  }

  return { embedded, skipped: 0 };
}
