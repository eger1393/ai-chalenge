export type ContextStrategyType = 'sliding_window' | 'sticky_facts';

export interface ContextStrategyParams {
  conversationId: string;
  systemMessages: Array<{ role: string; content: string }>;
  historyMessages: Array<{ role: string; content: string }>;
  currentMessage: string;
  model: string;
  maxContextTokens: number;
  strategyData: Record<string, unknown>;
  summary?: string;
  summaryUpToIndex?: number;
}

export interface ContextStrategyResult {
  strategyType: ContextStrategyType;
  messages: Array<{ role: string; content: string }>;
  truncatedMessages: number;
  truncatedTokens: number;
  contextUsedTokens: number;
  contextMaxTokens: number;
  updatedSummary?: string;
  updatedSummaryUpToIndex?: number;
  debugInfo?: Record<string, unknown>;
}

export interface IContextStrategy {
  prepareContext(params: ContextStrategyParams): Promise<ContextStrategyResult>;
}

export function normalizeContextStrategyType(value: unknown): ContextStrategyType {
  return value === 'sticky_facts' ? 'sticky_facts' : 'sliding_window';
}
