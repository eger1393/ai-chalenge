import { createDefaultConfig, validateConfig, type DocsRagConfig } from '../domain/config.js';
import { AppError } from './errors.js';

export interface ConfigRepository {
  configExists(projectRoot: string): Promise<boolean>;
  writeConfig(projectRoot: string, config: DocsRagConfig): Promise<string>;
  ensureIndexDir(projectRoot: string): Promise<void>;
  ensureGitIgnore(projectRoot: string): Promise<void>;
  directoryExists(projectRoot: string, relativePath: string): Promise<boolean>;
}

export interface InitConfigOptions {
  projectRoot: string;
  force: boolean;
  folders?: string[];
}

export interface InitConfigResult {
  configPath: string;
  folders: string[];
  overwritten: boolean;
}

export async function initConfig(repository: ConfigRepository, options: InitConfigOptions): Promise<InitConfigResult> {
  const exists = await repository.configExists(options.projectRoot);
  if (exists && !options.force) {
    throw new AppError('Конфиг .lorex/config.json уже существует. Используйте --force для перезаписи.', 'CONFIG_EXISTS');
  }

  const folders = options.folders?.length ? options.folders : await detectDefaultFolders(repository, options.projectRoot);
  const config = createDefaultConfig(folders);
  const validation = validateConfig(config);

  if (!validation.valid) {
    throw new AppError(`Сгенерирован невалидный конфиг:\n- ${validation.errors.join('\n- ')}`, 'INVALID_GENERATED_CONFIG');
  }

  await repository.ensureIndexDir(options.projectRoot);
  const configPath = await repository.writeConfig(options.projectRoot, config);
  await repository.ensureGitIgnore(options.projectRoot);

  return {
    configPath,
    folders,
    overwritten: exists,
  };
}

async function detectDefaultFolders(repository: ConfigRepository, projectRoot: string): Promise<string[]> {
  if (await repository.directoryExists(projectRoot, 'swarm-report')) {
    return ['swarm-report'];
  }

  if (await repository.directoryExists(projectRoot, 'docs')) {
    return ['docs'];
  }

  throw new AppError(
    'Не найдены дефолтные папки документации: swarm-report или docs. Передайте явный список через --folders.',
    'DEFAULT_FOLDERS_NOT_FOUND',
  );
}
