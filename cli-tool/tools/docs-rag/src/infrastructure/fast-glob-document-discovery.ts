import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fastGlob from 'fast-glob';
import type { DocumentDiscovery } from '../application/index-documents.js';
import { AppError } from '../application/errors.js';
import type { DocsRagConfig } from '../domain/config.js';
import type { ManifestDocument } from '../domain/manifest.js';

export class FastGlobDocumentDiscovery implements DocumentDiscovery {
  async discoverDocuments(projectRoot: string, config: DocsRagConfig): Promise<ManifestDocument[]> {
    const safeFolders = config.folders.map((folder) => normalizeSafeRelativePath(folder, 'folders'));
    const patterns = safeFolders.flatMap((folder) => config.include.map((includePattern) => `${folder}/${includePattern}`));

    const paths = await fastGlob(patterns, {
      cwd: projectRoot,
      absolute: false,
      onlyFiles: true,
      dot: true,
      unique: true,
      ignore: config.exclude,
      followSymbolicLinks: false,
    });

    const documents = await Promise.all(
      paths.sort().map(async (relativePath) => this.createManifestDocument(projectRoot, relativePath)),
    );

    return documents;
  }

  private async createManifestDocument(projectRoot: string, relativePath: string): Promise<ManifestDocument> {
    const safeRelativePath = normalizeSafeRelativePath(relativePath, 'document path');
    const absolutePath = path.join(projectRoot, safeRelativePath);
    const [metadata, content] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);

    return {
      path: safeRelativePath,
      contentHash: createHash('sha256').update(content).digest('hex'),
      mtimeMs: metadata.mtimeMs,
      sizeBytes: metadata.size,
    };
  }
}

export function normalizeSafeRelativePath(value: string, field: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');

  if (!normalized || normalized === '.' || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new AppError(`${field} должен быть относительным путём внутри проекта.`, 'UNSAFE_PATH');
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment.length === 0)) {
    throw new AppError(`${field} не должен содержать пустые сегменты или "..".`, 'UNSAFE_PATH');
  }

  return normalized;
}
