export type ContextStrategyType = 'sliding_window' | 'sticky_facts' | 'branching';

export interface AIParams {
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  systemPrompt: string;
  contextLimit: number;
  contextStrategy: ContextStrategyType;
  slidingWindowKeepLast: number;
}

export interface AppliedParams {
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty?: number;
  systemPrompt?: string;
}

export const AVAILABLE_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5.4', 'gpt-5.4-mini'] as const;

export const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini — $0.15/$0.60',
  'gpt-4o': 'GPT-4o — $2.50/$10.00',
  'gpt-4.1-nano': 'GPT-4.1 Nano — $0.10/$0.40',
  'gpt-4.1-mini': 'GPT-4.1 Mini — $0.40/$1.60',
  'gpt-4.1': 'GPT-4.1 — $2.00/$8.00',
  'gpt-5.4': 'GPT-5.4 — $2.50/$15.00',
  'gpt-5.4-mini': 'GPT-5.4 Mini — $0.75/$4.50',
};

export const MODEL_CONTEXT_SIZES: Record<string, number> = {
  'gpt-4o-mini': 128000,
  'gpt-4o': 128000,
  'gpt-4.1-nano': 1048576,
  'gpt-4.1-mini': 1048576,
  'gpt-4.1': 1048576,
  'gpt-5.4': 128000,
  'gpt-5.4-mini': 128000,
};

export const DEFAULT_AI_PARAMS: AIParams = {
  model: 'gpt-4o-mini',
  temperature: 1.0,
  maxTokens: 16384,
  repetitionPenalty: 0,
  systemPrompt: '',
  contextLimit: 0,
  contextStrategy: 'sliding_window',
  slidingWindowKeepLast: 10,
};

export const STRATEGY_LABELS: Record<ContextStrategyType, string> = {
  sliding_window: 'Окно',
  sticky_facts: 'Факты',
  branching: 'Ветки',
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
