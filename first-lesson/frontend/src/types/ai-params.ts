export interface AIParams {
  temperature: number;
  maxTokens: number;
  stop: string[];
  systemPrompt: string;
}

export interface AppliedParams {
  temperature: number;
  maxTokens: number;
  stop?: string[];
  systemPrompt?: string;
}

export const DEFAULT_AI_PARAMS: AIParams = {
  temperature: 1.0,
  maxTokens: 2048,
  stop: [],
  systemPrompt: '',
};
