export type AIProvider = 'openai' | 'ollama';
export type ContextStrategyType = 'sliding_window' | 'sticky_facts';
export type RagMode = 'filter' | 'reranker';

export interface AIParams {
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  systemPrompt: string;
  contextLimit: number;
  ragEnabled: boolean;
  ragQueryRewriteEnabled: boolean;
  ragMode: RagMode;
  contextStrategy: ContextStrategyType;
  slidingWindowKeepLast: number;
}

export interface AppliedParams {
  provider?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty?: number;
  systemPrompt?: string;
}

export const AVAILABLE_PROVIDERS = ['openai', 'ollama'] as const;

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'ChatGPT / OpenAI',
  ollama: 'Локальная Ollama',
};

export const MODELS_BY_PROVIDER: Record<AIProvider, readonly string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5.4', 'gpt-5.4-mini'],
  ollama: ['gemma4:31b', 'gemma4:26b'],
};

export const AVAILABLE_MODELS = Object.values(MODELS_BY_PROVIDER).flat() as string[];

export const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini — $0.15/$0.60',
  'gpt-4o': 'GPT-4o — $2.50/$10.00',
  'gpt-4.1-nano': 'GPT-4.1 Nano — $0.10/$0.40',
  'gpt-4.1-mini': 'GPT-4.1 Mini — $0.40/$1.60',
  'gpt-4.1': 'GPT-4.1 — $2.00/$8.00',
  'gpt-5.4': 'GPT-5.4 — $2.50/$15.00',
  'gpt-5.4-mini': 'GPT-5.4 Mini — $0.75/$4.50',
  'gemma4:31b': 'Gemma 4 31B — local',
  'gemma4:26b': 'Gemma 4 26B — local',
};

export const MODEL_CONTEXT_SIZES: Record<string, number> = {
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

export const DEFAULT_AI_PARAMS: AIParams = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 1.0,
  maxTokens: 16384,
  repetitionPenalty: 0,
  systemPrompt: '',
  contextLimit: 0,
  ragEnabled: false,
  ragQueryRewriteEnabled: false,
  ragMode: 'filter',
  contextStrategy: 'sliding_window',
  slidingWindowKeepLast: 10,
};

export const STRATEGY_LABELS: Record<ContextStrategyType, string> = {
  sliding_window: 'Окно',
  sticky_facts: 'Факты',
};

export const RAG_MODE_LABELS: Record<RagMode, string> = {
  filter: 'Фильтр',
  reranker: 'Reranker',
};

export interface Truncation {
  droppedMessages: number;
  droppedTokens: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  currentMessageTokens?: number;
  historyTokens?: number;
  systemPromptTokens?: number;
}

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && (AVAILABLE_PROVIDERS as readonly string[]).includes(value);
}

export function inferProviderFromModel(model: unknown): AIProvider | null {
  if (typeof model !== 'string') {
    return null;
  }

  return (Object.entries(MODELS_BY_PROVIDER).find(([, models]) => models.includes(model))?.[0] as AIProvider | undefined) ?? null;
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  return MODELS_BY_PROVIDER[provider][0] ?? DEFAULT_AI_PARAMS.model;
}

export function isModelSupportedByProvider(provider: AIProvider, model: unknown): model is string {
  return typeof model === 'string' && MODELS_BY_PROVIDER[provider].includes(model);
}
