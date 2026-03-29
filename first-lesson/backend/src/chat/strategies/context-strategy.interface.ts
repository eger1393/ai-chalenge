export type ContextStrategyType = 'sliding_window' | 'sticky_facts' | 'branching';

export interface ContextStrategyResult {
  messages: Array<{ role: string; content: string }>;
  usedTokens: number;
  truncatedCount: number;
  truncatedTokens: number;
  metadata?: Record<string, unknown>;
}

export interface IContextStrategy {
  prepareContext(params: {
    conversationId: string;
    historyMessages: Array<{ role: string; content: string }>;
    currentMessage: string;
    model: string;
    systemPrompt?: string;
    contextLimit?: number;
    strategyParams?: Record<string, unknown>;
  }): Promise<ContextStrategyResult>;
}
