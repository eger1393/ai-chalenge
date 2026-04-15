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
  metadata: Record<string, unknown>;
  document: RagDocumentRecord;
}

export interface RagContextResult {
  block: string;
  matches: RagChunkMatch[];
}

export interface RagDebugReference {
  rank: number;
  chunkId: string;
  documentId: string;
  similarity: number;
}

export interface RagDebugContext {
  enabled: boolean;
  matchCount: number;
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
