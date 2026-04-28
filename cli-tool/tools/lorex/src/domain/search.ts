export interface SearchResult {
  chunkId: string;
  documentPath: string;
  headingPath: string[];
  content: string;
  lexicalScore?: number;
  vectorScore?: number;
  finalScore: number;
}

export interface RankedChunk {
  chunkId: string;
  documentPath: string;
  headingPath: string[];
  content: string;
  lexicalScore?: number;
  vectorScore?: number;
}

export function rankHybridResults(
  lexicalResults: SearchResult[],
  vectorResults: SearchResult[],
  lexicalWeight: number,
  vectorWeight: number,
  limit: number,
): SearchResult[] {
  const byChunkId = new Map<string, RankedChunk>();

  for (const result of lexicalResults) {
    byChunkId.set(result.chunkId, {
      chunkId: result.chunkId,
      documentPath: result.documentPath,
      headingPath: result.headingPath,
      content: result.content,
      lexicalScore: result.lexicalScore ?? result.finalScore,
    });
  }

  for (const result of vectorResults) {
    const existing = byChunkId.get(result.chunkId);
    if (existing) {
      existing.vectorScore = result.vectorScore ?? result.finalScore;
    } else {
      byChunkId.set(result.chunkId, {
        chunkId: result.chunkId,
        documentPath: result.documentPath,
        headingPath: result.headingPath,
        content: result.content,
        vectorScore: result.vectorScore ?? result.finalScore,
      });
    }
  }

  return [...byChunkId.values()]
    .map((result) => ({
      ...result,
      finalScore: ((result.lexicalScore ?? 0) * lexicalWeight) + ((result.vectorScore ?? 0) * vectorWeight),
    }))
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, limit);
}
