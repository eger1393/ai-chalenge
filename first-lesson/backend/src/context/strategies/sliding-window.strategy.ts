import { Injectable } from '@nestjs/common';
import { IContextStrategy, ContextStrategyParams, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../../ai/token.service';
import { MODEL_CONTEXT_WINDOWS } from '../../ai/dto/ai-params.dto';

@Injectable()
export class SlidingWindowStrategy implements IContextStrategy {
  constructor(private readonly tokenService: TokenService) {}

  async prepareContext(params: ContextStrategyParams): Promise<ContextStrategyResult> {
    const {
      systemMessages,
      historyMessages,
      currentMessage,
      model,
      maxContextTokens,
      strategyData,
    } = params;

    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = maxContextTokens > 0
      ? Math.min(maxContextTokens, modelWindow)
      : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);
    const warningThreshold = Math.floor(contextWindow * 0.85);

    const allMessages = [...historyMessages, { role: 'user', content: currentMessage }];

    // Calculate total tokens including system messages
    let systemTokens = 0;
    for (const msg of systemMessages) {
      systemTokens += this.tokenService.countTokens(msg.content, model);
    }

    let totalTokens = systemTokens;
    for (const msg of allMessages) {
      totalTokens += this.tokenService.countTokens(msg.content, model);
    }

    // If everything fits, return as-is
    if (totalTokens <= warningThreshold) {
      return {
        messages: [...systemMessages, ...allMessages],
        truncatedMessages: 0,
        truncatedTokens: 0,
        contextUsedTokens: totalTokens,
        contextMaxTokens: contextWindow,
        debugInfo: {
          originalMessagesCount: allMessages.length,
          keptMessagesCount: allMessages.length,
          budgetMax: maxBudget,
          budgetUsed: totalTokens,
          keepLast: (strategyData?.keepLast as number) || undefined,
        },
      };
    }

    // Keep first 2 history messages + fill from the end
    const first2 = allMessages.slice(0, 2);
    const rest = allMessages.slice(2);

    let budgetUsed = systemTokens;
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
      messages: [...systemMessages, ...truncated],
      truncatedMessages: allMessages.length - truncated.length,
      truncatedTokens: totalTokens - budgetUsed,
      contextUsedTokens: budgetUsed,
      contextMaxTokens: contextWindow,
      debugInfo: {
        originalMessagesCount: allMessages.length,
        keptMessagesCount: truncated.length,
        budgetMax: maxBudget,
        budgetUsed,
        keepLast: (strategyData?.keepLast as number) || undefined,
      },
    };
  }
}
