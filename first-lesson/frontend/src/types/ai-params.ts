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
