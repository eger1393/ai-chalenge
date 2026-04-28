export type RetrievalMode = 'hybrid';
export type EmbeddingProvider = 'openai';

export interface DocsRagConfig {
  folders: string[];
  include: string[];
  exclude: string[];
  indexDir: string;
  chunking: {
    strategy: 'markdown-headings';
    maxTokens: number;
    overlapTokens: number;
  };
  retrieval: {
    mode: RetrievalMode;
    topK: number;
    lexicalWeight: number;
    vectorWeight: number;
  };
  embeddings: {
    provider: EmbeddingProvider;
    model: string;
  };
}

export const DEFAULT_INCLUDE = ['**/*.md', '**/*.mdx', '**/*.txt'] as const;

export const DEFAULT_EXCLUDE = [
  '**/.env*',
  '**/*credential*',
  '**/*credentials*',
  '**/*secret*',
  '**/*key*',
  '**/node_modules/**',
  '**/.git/**',
  '**/.lorex/**',
  '**/dist/**',
  '**/build/**',
] as const;

const FORBIDDEN_CONFIG_KEYS = new Set([
  'OPENAI_API_KEY',
  'openaiApiKey',
  'openAIApiKey',
  'apiKey',
  'apikey',
  'token',
  'secret',
  'password',
  'bearerToken',
]);

export function createDefaultConfig(folders: string[]): DocsRagConfig {
  return {
    folders,
    include: [...DEFAULT_INCLUDE],
    exclude: [...DEFAULT_EXCLUDE],
    indexDir: '.lorex',
    chunking: {
      strategy: 'markdown-headings',
      maxTokens: 700,
      overlapTokens: 100,
    },
    retrieval: {
      mode: 'hybrid',
      topK: 8,
      lexicalWeight: 0.45,
      vectorWeight: 0.55,
    },
    embeddings: {
      provider: 'openai',
      model: 'text-embedding-3-small',
    },
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateConfig(value: unknown): ValidationResult {
  const errors: string[] = [];
  const forbiddenKeys = findForbiddenKeys(value);

  for (const key of forbiddenKeys) {
    errors.push(`Запрещённое поле в config.json: ${key}. Секреты должны передаваться только через окружение.`);
  }

  if (!isRecord(value)) {
    return { valid: false, errors: [...errors, 'config.json должен быть JSON-объектом.'] };
  }

  assertStringArray(value.folders, 'folders', errors, { allowEmpty: false });
  assertStringArray(value.include, 'include', errors, { allowEmpty: false });
  assertStringArray(value.exclude, 'exclude', errors, { allowEmpty: false });
  assertString(value.indexDir, 'indexDir', errors);

  if (value.folders instanceof Array && value.folders.includes('.')) {
    errors.push('folders не должен содержать ".". Укажите явные папки с документацией.');
  }

  if (value.folders instanceof Array) {
    for (const folder of value.folders) {
      if (typeof folder === 'string' && !isSafeRelativePath(folder)) {
        errors.push(`folders содержит небезопасный путь: ${folder}. Используйте относительные пути внутри проекта без "..".`);
      }
    }
  }

  for (const requiredExclude of DEFAULT_EXCLUDE.slice(0, 8)) {
    if (Array.isArray(value.exclude) && !value.exclude.includes(requiredExclude)) {
      errors.push(`exclude должен содержать безопасный паттерн ${requiredExclude}.`);
    }
  }

  if (!isRecord(value.chunking)) {
    errors.push('chunking должен быть объектом.');
  } else {
    if (value.chunking.strategy !== 'markdown-headings') {
      errors.push('chunking.strategy должен быть "markdown-headings".');
    }
    assertPositiveInteger(value.chunking.maxTokens, 'chunking.maxTokens', errors);
    assertNonNegativeInteger(value.chunking.overlapTokens, 'chunking.overlapTokens', errors);
  }

  if (!isRecord(value.retrieval)) {
    errors.push('retrieval должен быть объектом.');
  } else {
    if (value.retrieval.mode !== 'hybrid') {
      errors.push('retrieval.mode должен быть "hybrid".');
    }
    assertPositiveInteger(value.retrieval.topK, 'retrieval.topK', errors);
    assertWeight(value.retrieval.lexicalWeight, 'retrieval.lexicalWeight', errors);
    assertWeight(value.retrieval.vectorWeight, 'retrieval.vectorWeight', errors);
  }

  if (!isRecord(value.embeddings)) {
    errors.push('embeddings должен быть объектом.');
  } else {
    if (value.embeddings.provider !== 'openai') {
      errors.push('embeddings.provider должен быть "openai".');
    }
    assertString(value.embeddings.model, 'embeddings.model', errors);
  }

  return { valid: errors.length === 0, errors };
}

function findForbiddenKeys(value: unknown, path = ''): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;
    const nestedMatches = findForbiddenKeys(nestedValue, currentPath);
    return isForbiddenConfigKey(key) ? [currentPath, ...nestedMatches] : nestedMatches;
  });
}

function isForbiddenConfigKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return FORBIDDEN_CONFIG_KEYS.has(key)
    || normalized.includes('apikey')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized === 'token'
    || normalized.endsWith('token');
}

function assertStringArray(value: unknown, field: string, errors: string[], options: { allowEmpty: boolean }): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push(`${field} должен быть непустым массивом строк.`);
    return;
  }

  if (!options.allowEmpty && value.length === 0) {
    errors.push(`${field} не должен быть пустым.`);
  }
}

function assertString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${field} должен быть непустой строкой.`);
  }
}

function assertPositiveInteger(value: unknown, field: string, errors: string[]): void {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    errors.push(`${field} должен быть положительным целым числом.`);
  }
}

function assertNonNegativeInteger(value: unknown, field: string, errors: string[]): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    errors.push(`${field} должен быть неотрицательным целым числом.`);
  }
}

function assertWeight(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== 'number' || value < 0 || value > 1) {
    errors.push(`${field} должен быть числом от 0 до 1.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  return Boolean(normalized)
    && normalized !== '.'
    && !normalized.startsWith('/')
    && !normalized.includes('\0')
    && normalized.split('/').every((segment) => segment.length > 0 && segment !== '..');
}
