import { Injectable } from '@nestjs/common';
import { IContextStrategy, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../services/token.service';
import { MODEL_CONTEXT_WINDOWS } from '../dto/ai-params.dto';

@Injectable()
export class SlidingWindowStrategy implements IContextStrategy {
  constructor(
    private readonly tokenService: TokenService,
  ) {}

  async prepareContext(params: {
    conversationId: string;
    historyMessages: Array<{ role: string; content: string }>;
    currentMessage: string;
    model: string;
    systemPrompt?: string;
    contextLimit?: number;
    strategyParams?: Record<string, unknown>;
  }): Promise<ContextStrategyResult> {
    const { historyMessages, currentMessage, model, systemPrompt, contextLimit, strategyParams } = params;
    const verbose = strategyParams?.verbose === true;

    // Sliding window: just keep messages that fit in budget, drop the rest
    const allMessages = [...historyMessages, { role: 'user', content: currentMessage }];
    const result = this.truncateMessages(allMessages, model, systemPrompt, contextLimit);

    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = contextLimit && contextLimit > 0 ? Math.min(contextLimit, modelWindow) : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);

    result.metadata = {
      originalMessagesCount: allMessages.length,
      keptMessagesCount: result.messages.length,
      budgetMax: maxBudget,
      budgetUsed: result.usedTokens,
    };

    return result;
  }

  private truncateMessages(
    messages: Array<{ role: string; content: string }>,
    model: string,
    systemPrompt?: string,
    contextLimit?: number,
  ): ContextStrategyResult {
    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = contextLimit && contextLimit > 0 ? Math.min(contextLimit, modelWindow) : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);
    const warningThreshold = Math.floor(contextWindow * 0.85);

    let totalTokens = systemPrompt ? this.tokenService.countTokens(systemPrompt, model) : 0;
    for (const msg of messages) {
      totalTokens += this.tokenService.countTokens(msg.content, model);
    }

    if (totalTokens <= warningThreshold) {
      return { messages, usedTokens: totalTokens, truncatedCount: 0, truncatedTokens: 0 };
    }

    const first2 = messages.slice(0, 2);
    const rest = messages.slice(2);

    let budgetUsed = systemPrompt ? this.tokenService.countTokens(systemPrompt, model) : 0;
    for (const msg of first2) {
      budgetUsed += this.tokenService.countTokens(msg.content, model);
    }

    const kept: Array<{ role: string; content: string }> = [];
    for (let i = rest.length - 1; i >= 0; i--) {
      const tokens = this.tokenService.countTokens(rest[i].content, model);
      if (budgetUsed + tokens > maxBudget) break;
      budgetUsed += tokens;
      kept.unshift(rest[i]);
    }

    const truncated = [...first2, ...kept];
    return {
      messages: truncated,
      usedTokens: budgetUsed,
      truncatedCount: messages.length - truncated.length,
      truncatedTokens: totalTokens - budgetUsed,
    };
  }

}
