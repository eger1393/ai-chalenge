import {
  IsOptional,
  IsNumber,
  IsInt,
  IsString,
  IsIn,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ALLOWED_RAG_MODES } from '../../rag/constants';

export const ALLOWED_PROVIDERS = ['openai', 'ollama'] as const;
export type AIProvider = (typeof ALLOWED_PROVIDERS)[number];

export const PROVIDER_MODELS: Record<AIProvider, readonly string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5.4', 'gpt-5.4-mini'],
  ollama: ['gemma4:31b', 'gemma4:26b'],
};

export const ALLOWED_MODELS = Object.values(PROVIDER_MODELS).flat() as string[];
export const DEFAULT_PROVIDER: AIProvider = 'openai';
export const DEFAULT_MODEL = 'gpt-4o-mini';

// Pricing per 1M tokens in USD (short context, non-cached)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gemma4:31b': { input: 0, output: 0 },
  'gemma4:26b': { input: 0, output: 0 },
};

// Context window sizes per model (in tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o-mini': 128000,
  'gpt-4o': 128000,
  'gpt-4.1-nano': 1048576,
  'gpt-4.1-mini': 1048576,
  'gpt-4.1': 1048576,
  'gpt-5.4': 128000,
  'gpt-5.4-mini': 128000,
  'gemma4:31b': 32768,
  'gemma4:26b': 32768,
};

export interface AISelection {
  provider: AIProvider;
  model: string;
}

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeAIProvider(value: unknown): AIProvider {
  return isAIProvider(value) ? value : DEFAULT_PROVIDER;
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return PROVIDER_MODELS[provider][0] ?? DEFAULT_MODEL;
}

export function inferProviderFromModel(model: unknown): AIProvider | null {
  if (typeof model !== 'string') {
    return null;
  }

  return (Object.entries(PROVIDER_MODELS).find(([, models]) => models.includes(model))?.[0] as AIProvider | undefined) ?? null;
}

export function isModelSupportedByProvider(provider: AIProvider, model: unknown): model is string {
  return typeof model === 'string' && PROVIDER_MODELS[provider].includes(model);
}

export function resolveAISelection(
  selection: { provider?: unknown; model?: unknown },
  fallback: AISelection = { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
): AISelection {
  const provider = selection.provider;
  const model = selection.model;

  if (provider != null && !isAIProvider(provider)) {
    throw new Error(`Unsupported AI provider: ${String(provider)}`);
  }

  if (model != null && (typeof model !== 'string' || !ALLOWED_MODELS.includes(model))) {
    throw new Error(`Unsupported AI model: ${String(model)}`);
  }

  const normalizedProvider = provider != null && isAIProvider(provider) ? provider : undefined;
  const normalizedModel = typeof model === 'string' ? model : undefined;

  if (normalizedProvider && normalizedModel) {
    if (!isModelSupportedByProvider(normalizedProvider, normalizedModel)) {
      throw new Error(`Model ${normalizedModel} is not available for provider ${normalizedProvider}`);
    }
    return { provider: normalizedProvider, model: normalizedModel };
  }

  if (normalizedModel) {
    const inferredProvider = inferProviderFromModel(normalizedModel);
    if (!inferredProvider) {
      throw new Error(`Unsupported AI model: ${normalizedModel}`);
    }
    return { provider: inferredProvider, model: normalizedModel };
  }

  if (normalizedProvider) {
    return { provider: normalizedProvider, model: getDefaultModelForProvider(normalizedProvider) };
  }

  return fallback;
}

export function resolveStoredAISelection(selection: {
  provider?: unknown;
  model?: unknown;
}): AISelection {
  const fallback = { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };

  try {
    return resolveAISelection(selection, fallback);
  } catch {
    if (typeof selection.model === 'string') {
      const inferredProvider = inferProviderFromModel(selection.model);
      if (inferredProvider) {
        return { provider: inferredProvider, model: selection.model };
      }
    }

    return fallback;
  }
}

export class AIParamsDto {
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_PROVIDERS as unknown as string[])
  provider?: AIProvider;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODELS as unknown as string[])
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32768)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  repetitionPenalty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1048576)
  contextLimit?: number;

  @IsOptional()
  @IsBoolean()
  ragEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ragQueryRewriteEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_RAG_MODES as unknown as string[])
  ragMode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  summaryMode?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  summaryKeepLast?: number;

  @IsOptional()
  @IsString()
  @IsIn(['sliding_window', 'sticky_facts'])
  contextStrategy?: string;

  @IsOptional()
  strategyParams?: Record<string, unknown>;
}
