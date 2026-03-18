export interface AIParams {
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty: number;
  systemPrompt: string;
}

export interface AppliedParams {
  model: string;
  temperature: number;
  maxTokens: number;
  repetitionPenalty?: number;
  systemPrompt?: string;
}

export const AVAILABLE_MODELS = ['GigaChat', 'GigaChat-Plus', 'GigaChat-Pro'] as const;

export const MODEL_LABELS: Record<string, string> = {
  'GigaChat': 'GigaChat (бесплатная)',
  'GigaChat-Plus': 'GigaChat Plus',
  'GigaChat-Pro': 'GigaChat Pro',
};

export const DEFAULT_AI_PARAMS: AIParams = {
  model: 'GigaChat',
  temperature: 1.0,
  maxTokens: 2048,
  repetitionPenalty: 1.0,
  systemPrompt: '',
};
