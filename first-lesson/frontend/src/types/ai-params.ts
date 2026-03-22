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

export const DEFAULT_AI_PARAMS: AIParams = {
  model: 'gpt-4o-mini',
  temperature: 1.0,
  maxTokens: 16384,
  repetitionPenalty: 0,
  systemPrompt: '',
};

export interface Expert {
  name: string;
  roleId?: string;
  systemPrompt: string;
  mode: 'role' | 'custom';
}

export interface Role {
  id: string;
  name: string;
}

export interface ConsiliumParams {
  enabled: boolean;
  experts: Expert[];
}

export const DEFAULT_CONSILIUM: ConsiliumParams = {
  enabled: false,
  experts: [
    { name: 'Эксперт 1', systemPrompt: '', mode: 'custom', roleId: '' },
    { name: 'Эксперт 2', systemPrompt: '', mode: 'custom', roleId: '' },
  ],
};

export interface ExpertOpinion {
  expert: string;
  reply: string;
  error?: boolean;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
