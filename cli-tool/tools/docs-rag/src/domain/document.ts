export interface SourceDocument {
  path: string;
  content: string;
  contentHash: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface Chunk {
  id: string;
  documentPath: string;
  headingPath: string[];
  content: string;
  contentHash: string;
  tokenCount: number;
  ordinal: number;
}
