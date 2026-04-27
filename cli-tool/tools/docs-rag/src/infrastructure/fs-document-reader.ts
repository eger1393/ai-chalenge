import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentReader } from '../application/index-documents.js';
import type { ManifestDocument } from '../domain/manifest.js';
import type { SourceDocument } from '../domain/document.js';

export class FsDocumentReader implements DocumentReader {
  async readDocument(projectRoot: string, document: ManifestDocument): Promise<SourceDocument> {
    const content = await readFile(path.join(projectRoot, document.path), 'utf8');

    return {
      path: document.path,
      content,
      contentHash: document.contentHash,
      mtimeMs: document.mtimeMs,
      sizeBytes: document.sizeBytes,
    };
  }
}
