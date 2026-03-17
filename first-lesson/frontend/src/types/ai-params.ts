export interface AIParams {
  model: string;
  temperature: number;
  maxTokens: number;
  stop: string[];
  systemPrompt: string;
}

export interface AppliedParams {
  model: string;
  temperature: number;
  maxTokens: number;
  stop?: string[];
  systemPrompt?: string;
}

export const AVAILABLE_MODELS = ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'] as const;

export const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini (дешёвая)',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'gpt-4o': 'GPT-4o (средняя)',
};

export const DEFAULT_AI_PARAMS: AIParams = {
  model: 'gpt-4o-mini',
  temperature: 1.0,
  maxTokens: 2048,
  stop: [],
  systemPrompt: '',
};
