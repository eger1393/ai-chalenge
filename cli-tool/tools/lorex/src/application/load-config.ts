import { validateConfig, type DocsRagConfig } from '../domain/config.js';
import { AppError } from './errors.js';

export interface ConfigReader {
  readConfig(projectRoot: string): Promise<unknown>;
}

export async function loadConfig(reader: ConfigReader, projectRoot: string): Promise<DocsRagConfig> {
  const rawConfig = await reader.readConfig(projectRoot);
  const validation = validateConfig(rawConfig);

  if (!validation.valid) {
    throw new AppError(`Некорректный .lorex/config.json:\n- ${validation.errors.join('\n- ')}`, 'INVALID_CONFIG');
  }

  return rawConfig as DocsRagConfig;
}
