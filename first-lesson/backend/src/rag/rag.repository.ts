import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RagChunkMatch, RagDebugChunkDetails, RagDocumentRecord } from './rag.types';

interface SearchRow {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
  chunk_metadata: Record<string, unknown> | null;
  source_type: string;
  source_key: string;
  external_id: string;
  published_at: Date | null;
  full_text: string;
  document_metadata: Record<string, unknown> | null;
}

interface DebugChunkRow {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  char_count: number;
  embedding_model: string;
  chunk_metadata: Record<string, unknown> | null;
  source_type: string;
  source_key: string;
  external_id: string;
  published_at: Date | null;
  full_text: string;
  document_metadata: Record<string, unknown> | null;
}

@Injectable()
export class RagRepository {
  constructor(private readonly db: DatabaseService) {}

  async searchRelevantChunks(embedding: number[], topK: number): Promise<RagChunkMatch[]> {
    const result = await this.db.query<SearchRow>(
      `
        SELECT
          c.id AS chunk_id,
          c.document_id,
          c.chunk_index,
          c.content,
          (1 - (c.embedding <=> $1::vector)) AS similarity,
          c.metadata AS chunk_metadata,
          d.source_type,
          d.source_key,
          d.external_id,
          d.published_at,
          d.full_text,
          d.metadata AS document_metadata
        FROM rag_chunks c
        JOIN rag_documents d ON d.id = c.document_id
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2
      `,
      [serializeVector(embedding), topK],
    );

    return result.rows.map((row) => {
      const document: RagDocumentRecord = {
        id: row.document_id,
        sourceType: row.source_type,
        sourceKey: row.source_key,
        externalId: row.external_id,
        publishedAt: row.published_at,
        fullText: row.full_text,
        metadata: row.document_metadata ?? {},
      };

      return {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: Number(row.similarity),
        metadata: row.chunk_metadata ?? {},
        document,
      };
    });
  }

  async getDebugChunkDetails(chunkIds: string[]): Promise<RagDebugChunkDetails[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const result = await this.db.query<DebugChunkRow>(
      `
        WITH requested(chunk_id, rank) AS (
          SELECT * FROM unnest($1::uuid[]) WITH ORDINALITY
        )
        SELECT
          c.id AS chunk_id,
          c.document_id,
          c.chunk_index,
          c.content,
          c.char_count,
          c.embedding_model,
          c.metadata AS chunk_metadata,
          d.source_type,
          d.source_key,
          d.external_id,
          d.published_at,
          d.full_text,
          d.metadata AS document_metadata
        FROM requested r
        JOIN rag_chunks c ON c.id = r.chunk_id
        JOIN rag_documents d ON d.id = c.document_id
        ORDER BY r.rank
      `,
      [chunkIds],
    );

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      charCount: row.char_count,
      embeddingModel: row.embedding_model,
      chunkMetadata: row.chunk_metadata ?? {},
      sourceType: row.source_type,
      sourceKey: row.source_key,
      externalId: row.external_id,
      publishedAt: row.published_at,
      fullText: row.full_text,
      documentMetadata: row.document_metadata ?? {},
    }));
  }
}

function serializeVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
