import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Chunk } from '../domain/document.js';
import type { ManifestDocument } from '../domain/manifest.js';
import type { SearchResult } from '../domain/search.js';
import type { LexicalSearchRepository, VectorSearchRepository } from '../application/query-documents.js';
import type { ChunkEmbedding, ChunkEmbeddingStorage } from '../application/embed-chunks.js';
import { AppError } from '../application/errors.js';

const INDEX_DIR = '.lorex';
const DB_FILE = 'index.sqlite';

export interface ChunkStorageRepository extends LexicalSearchRepository, VectorSearchRepository, ChunkEmbeddingStorage {
  replaceChunks(projectRoot: string, documents: ManifestDocument[], chunks: Chunk[]): Promise<string>;
}

interface SearchRow {
  id: string;
  document_path: string;
  heading_path: string;
  content: string;
  score: number;
}

interface VectorRow {
  id: string;
  document_path: string;
  heading_path: string;
  content: string;
  embedding_json: string;
}

export class SqliteChunkStorage implements ChunkStorageRepository {
  async replaceChunks(projectRoot: string, documents: ManifestDocument[], chunks: Chunk[]): Promise<string> {
    await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
    const databasePath = this.databasePath(projectRoot);
    const database = new Database(databasePath);

    try {
      this.ensureSchema(database);
      const replace = database.transaction(() => {
        const currentChunkIds = new Set(chunks.map((chunk) => chunk.id));
        const existingChunkIds = database.prepare('SELECT id FROM chunks').all() as Array<{ id: string }>;
        const deleteChunkFts = database.prepare('DELETE FROM chunks_fts WHERE rowid = (SELECT rowid FROM chunks WHERE id = ?)');
        const deleteChunk = database.prepare('DELETE FROM chunks WHERE id = ?');
        for (const existing of existingChunkIds) {
          if (!currentChunkIds.has(existing.id)) {
            deleteChunkFts.run(existing.id);
            deleteChunk.run(existing.id);
          }
        }

        const currentDocumentPaths = new Set(documents.map((document) => document.path));
        const existingDocumentPaths = database.prepare('SELECT path FROM documents').all() as Array<{ path: string }>;
        const deleteDocument = database.prepare('DELETE FROM documents WHERE path = ?');
        for (const existing of existingDocumentPaths) {
          if (!currentDocumentPaths.has(existing.path)) {
            deleteDocument.run(existing.path);
          }
        }

        const insertDocument = database.prepare(`
          INSERT OR REPLACE INTO documents (path, content_hash, mtime_ms, size_bytes)
          VALUES (@path, @contentHash, @mtimeMs, @sizeBytes)
        `);
        const insertChunk = database.prepare(`
          INSERT INTO chunks (id, document_path, heading_path, content, content_hash, token_count, ordinal)
          VALUES (@id, @documentPath, @headingPath, @content, @contentHash, @tokenCount, @ordinal)
          ON CONFLICT(id) DO UPDATE SET
            document_path = excluded.document_path,
            heading_path = excluded.heading_path,
            content = excluded.content,
            token_count = excluded.token_count,
            ordinal = excluded.ordinal
        `);
        const selectRowId = database.prepare('SELECT rowid FROM chunks WHERE id = ?');
        const deleteFtsByRowId = database.prepare('DELETE FROM chunks_fts WHERE rowid = ?');
        const insertFts = database.prepare(`
          INSERT INTO chunks_fts (rowid, content, heading_path, document_path)
          VALUES (@rowid, @content, @headingPathText, @documentPath)
        `);

        for (const document of documents) {
          insertDocument.run({
            path: document.path,
            contentHash: document.contentHash,
            mtimeMs: document.mtimeMs,
            sizeBytes: document.sizeBytes,
          });
        }

        for (const chunk of chunks) {
          const headingPath = JSON.stringify(chunk.headingPath);
          insertChunk.run({
            id: chunk.id,
            documentPath: chunk.documentPath,
            headingPath,
            content: chunk.content,
            contentHash: chunk.contentHash,
            tokenCount: chunk.tokenCount,
            ordinal: chunk.ordinal,
          });
          const result = selectRowId.get(chunk.id) as { rowid: number | bigint };
          deleteFtsByRowId.run(result.rowid);
          insertFts.run({
            rowid: result.rowid,
            content: chunk.content,
            headingPathText: chunk.headingPath.join(' > '),
            documentPath: chunk.documentPath,
          });
        }
      });

      replace();
      return databasePath;
    } finally {
      database.close();
    }
  }

  async listChunksMissingEmbeddings(projectRoot: string, model: string): Promise<Chunk[]> {
    const database = new Database(this.databasePath(projectRoot));

    try {
      this.ensureSchema(database);
      const rows = database.prepare(`
        SELECT id, document_path, heading_path, content, content_hash, token_count, ordinal
        FROM chunks
        WHERE embedding_model IS NULL OR embedding_model != ? OR embedding_json IS NULL
        ORDER BY document_path ASC, ordinal ASC
      `).all(model) as Array<{
        id: string;
        document_path: string;
        heading_path: string;
        content: string;
        content_hash: string;
        token_count: number;
        ordinal: number;
      }>;

      return rows.map((row) => ({
        id: row.id,
        documentPath: row.document_path,
        headingPath: parseHeadingPath(row.heading_path),
        content: row.content,
        contentHash: row.content_hash,
        tokenCount: row.token_count,
        ordinal: row.ordinal,
      }));
    } finally {
      database.close();
    }
  }

  async saveChunkEmbeddings(projectRoot: string, embeddings: ChunkEmbedding[]): Promise<void> {
    const database = new Database(this.databasePath(projectRoot));

    try {
      this.ensureSchema(database);
      const save = database.transaction(() => {
        const update = database.prepare('UPDATE chunks SET embedding_model = ?, embedding_json = ? WHERE id = ?');
        for (const embedding of embeddings) {
          update.run(embedding.model, JSON.stringify(embedding.vector), embedding.chunkId);
        }
      });
      save();
    } finally {
      database.close();
    }
  }

  async searchLexical(projectRoot: string, query: string, limit: number): Promise<SearchResult[]> {
    const matchQuery = toFtsMatchQuery(query);
    if (!matchQuery) {
      return [];
    }

    const database = new Database(this.databasePath(projectRoot), { readonly: true, fileMustExist: true });

    try {
      this.ensureSchema(database);
      const rows = database.prepare(`
        SELECT
          chunks.id,
          chunks.document_path,
          chunks.heading_path,
          chunks.content,
          bm25(chunks_fts) AS score
        FROM chunks_fts
        JOIN chunks ON chunks.rowid = chunks_fts.rowid
        WHERE chunks_fts MATCH ?
        ORDER BY score ASC
        LIMIT ?
      `).all(matchQuery, limit) as SearchRow[];

      return rows.map((row) => {
        const lexicalScore = normalizeBm25(row.score);
        return {
          chunkId: row.id,
          documentPath: row.document_path,
          headingPath: parseHeadingPath(row.heading_path),
          content: row.content,
          lexicalScore,
          finalScore: lexicalScore,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('unable to open database file')) {
        throw new AppError('Индекс не найден. Сначала выполните lorex index.', 'INDEX_NOT_FOUND');
      }

      throw error;
    } finally {
      database.close();
    }
  }

  async searchVector(projectRoot: string, queryVector: number[], model: string, limit: number): Promise<SearchResult[]> {
    if (queryVector.length === 0) {
      return [];
    }

    const database = new Database(this.databasePath(projectRoot), { readonly: true, fileMustExist: true });

    try {
      this.ensureSchema(database);
      const rows = database.prepare(`
        SELECT id, document_path, heading_path, content, embedding_json
        FROM chunks
        WHERE embedding_model = ? AND embedding_json IS NOT NULL
      `).all(model) as VectorRow[];

      return rows
        .map((row) => {
          const vector = parseEmbedding(row.embedding_json);
          const vectorScore = cosineSimilarity(queryVector, vector);
          return {
            chunkId: row.id,
            documentPath: row.document_path,
            headingPath: parseHeadingPath(row.heading_path),
            content: row.content,
            vectorScore,
            finalScore: vectorScore,
          };
        })
        .filter((result) => Number.isFinite(result.vectorScore))
        .sort((left, right) => right.vectorScore - left.vectorScore)
        .slice(0, limit);
    } catch (error) {
      if (error instanceof Error && error.message.includes('unable to open database file')) {
        throw new AppError('Индекс не найден. Сначала выполните lorex index.', 'INDEX_NOT_FOUND');
      }

      throw error;
    } finally {
      database.close();
    }
  }

  private ensureSchema(database: Database.Database): void {
    database.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        mtime_ms REAL NOT NULL,
        size_bytes INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_path TEXT NOT NULL REFERENCES documents(path) ON DELETE CASCADE,
        heading_path TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        embedding_model TEXT,
        embedding_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_document_path ON chunks(document_path);

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        heading_path,
        document_path,
        tokenize = 'unicode61'
      );
    `);
    this.ignoreDuplicateColumn(database, 'ALTER TABLE chunks ADD COLUMN embedding_model TEXT');
    this.ignoreDuplicateColumn(database, 'ALTER TABLE chunks ADD COLUMN embedding_json TEXT');
  }

  private ignoreDuplicateColumn(database: Database.Database, sql: string): void {
    try {
      database.exec(sql);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate column name')) {
        return;
      }
      throw error;
    }
  }

  private databasePath(projectRoot: string): string {
    return path.join(projectRoot, INDEX_DIR, DB_FILE);
  }
}

function toFtsMatchQuery(query: string): string {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(terms)].map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

function normalizeBm25(score: number): number {
  return score < 0 ? 1 - (1 / (1 - score)) : 1 / (1 + score);
}

function parseHeadingPath(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function parseEmbedding(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number') ? parsed : [];
  } catch {
    return [];
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return (dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) + 1) / 2;
}
