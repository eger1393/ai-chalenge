import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ManifestRepository } from '../application/index-documents.js';
import { AppError } from '../application/errors.js';
import { isManifest, type Manifest } from '../domain/manifest.js';

const INDEX_DIR = '.docs-rag';
const MANIFEST_FILE = 'manifest.json';

export class FsManifestRepository implements ManifestRepository {
  async readManifest(projectRoot: string): Promise<Manifest | undefined> {
    const manifestPath = this.manifestPath(projectRoot);

    try {
      const content = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      if (!isManifest(parsed)) {
        throw new AppError(`Файл ${manifestPath} имеет неподдерживаемый формат manifest.`, 'INVALID_MANIFEST');
      }

      return parsed;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new AppError(`Файл ${manifestPath} содержит невалидный JSON.`, 'INVALID_MANIFEST');
      }

      return undefined;
    }
  }

  async writeManifest(projectRoot: string, manifest: Manifest): Promise<string> {
    await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
    const manifestPath = this.manifestPath(projectRoot);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifestPath;
  }

  private manifestPath(projectRoot: string): string {
    return path.join(projectRoot, INDEX_DIR, MANIFEST_FILE);
  }
}
