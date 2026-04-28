import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type OpenAiApiKeySource = 'environment' | 'dotenv' | 'missing';

export interface OpenAiApiKeyResult {
  key?: string;
  source: OpenAiApiKeySource;
  dotenvPath?: string;
}

export async function resolveOpenAiApiKey(cwd = process.cwd()): Promise<OpenAiApiKeyResult> {
  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, source: 'environment' };
  }

  const dotenvPath = path.join(cwd, '.env');
  const dotenv = await readDotenv(dotenvPath);
  const key = dotenv.OPENAI_API_KEY;

  if (key) {
    return { key, source: 'dotenv', dotenvPath };
  }

  return { source: 'missing', dotenvPath };
}

export function parseDotenv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = parseDotenvValue(normalizedLine.slice(separatorIndex + 1).trim());
  }

  return values;
}

async function readDotenv(dotenvPath: string): Promise<Record<string, string>> {
  try {
    return parseDotenv(await readFile(dotenvPath, 'utf8'));
  } catch {
    return {};
  }
}

function parseDotenvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(' #');
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim();
}
