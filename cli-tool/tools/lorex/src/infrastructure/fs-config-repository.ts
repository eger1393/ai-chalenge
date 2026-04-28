import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ConfigRepository } from '../application/init-config.js';
import { AppError } from '../application/errors.js';
import type { DocsRagConfig } from '../domain/config.js';

const INDEX_DIR = '.lorex';
const CONFIG_FILE = 'config.json';
const GITIGNORE_ENTRY = '.lorex/';

export class FsConfigRepository implements ConfigRepository {
  async configExists(projectRoot: string): Promise<boolean> {
    try {
      await access(this.configPath(projectRoot));
      return true;
    } catch {
      return false;
    }
  }

  async writeConfig(projectRoot: string, config: DocsRagConfig): Promise<string> {
    const configPath = this.configPath(projectRoot);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8' });
    return configPath;
  }

  async readConfig(projectRoot: string): Promise<unknown> {
    const configPath = this.configPath(projectRoot);

    try {
      const content = await readFile(configPath, 'utf8');
      return JSON.parse(content) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AppError(`Файл ${configPath} содержит невалидный JSON.`, 'INVALID_JSON');
      }

      throw new AppError(`Не удалось прочитать ${configPath}. Сначала выполните lorex init.`, 'CONFIG_NOT_FOUND');
    }
  }

  async ensureIndexDir(projectRoot: string): Promise<void> {
    await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
  }

  async ensureGitIgnore(projectRoot: string): Promise<void> {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    let content = '';

    try {
      content = await readFile(gitignorePath, 'utf8');
    } catch {
      content = '';
    }

    const lines = content.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(GITIGNORE_ENTRY) || lines.includes('.lorex')) {
      return;
    }

    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await writeFile(gitignorePath, `${content}${separator}${GITIGNORE_ENTRY}\n`, 'utf8');
  }

  async directoryExists(projectRoot: string, relativePath: string): Promise<boolean> {
    try {
      const stats = await stat(path.join(projectRoot, relativePath));
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private configPath(projectRoot: string): string {
    return path.join(projectRoot, INDEX_DIR, CONFIG_FILE);
  }
}
