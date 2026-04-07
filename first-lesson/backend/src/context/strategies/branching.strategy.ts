import { Injectable, Logger } from '@nestjs/common';
import { IContextStrategy, ContextStrategyParams, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../../ai/token.service';
import { MODEL_CONTEXT_WINDOWS } from '../../ai/dto/ai-params.dto';

@Injectable()
export class BranchingStrategy implements IContextStrategy {
  private readonly logger = new Logger(BranchingStrategy.name);

  constructor(private readonly tokenService: TokenService) {}

  async prepareContext(params: ContextStrategyParams): Promise<ContextStrategyResult> {
    const {
      systemMessages,
      historyMessages,
      currentMessage,
      model,
      maxContextTokens,
    } = params;

    // historyMessages already filtered by the calling code for the active branch
    const allMessages = [...historyMessages, { role: 'user', content: currentMessage }];

    return this.truncateByTokens(allMessages, systemMessages, model, maxContextTokens);
  }

  private truncateByTokens(
    messages: Array<{ role: string; content: string }>,
    systemMessages: Array<{ role: string; content: string }>,
    model: string,
    maxContextTokens: number,
  ): ContextStrategyResult {
    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = maxContextTokens > 0
      ? Math.min(maxContextTokens, modelWindow)
      : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);
    const warningThreshold = Math.floor(contextWindow * 0.85);

    let systemTokens = 0;
    for (const msg of systemMessages) {
      systemTokens += this.tokenService.countTokens(msg.content, model);
    }

    let totalTokens = systemTokens;
    for (const msg of messages) {
      totalTokens += this.tokenService.countTokens(msg.content, model);
    }

    if (totalTokens <= warningThreshold) {
      return {
        messages: [...systemMessages, ...messages],
        truncatedMessages: 0,
        truncatedTokens: 0,
        contextUsedTokens: totalTokens,
        contextMaxTokens: contextWindow,
        debugInfo: {
          originalMessagesCount: messages.length,
          keptMessagesCount: messages.length,
        },
      };
    }

    const first2 = messages.slice(0, 2);
    const rest = messages.slice(2);

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
      truncatedMessages: messages.length - truncated.length,
      truncatedTokens: totalTokens - budgetUsed,
      contextUsedTokens: budgetUsed,
      contextMaxTokens: contextWindow,
      debugInfo: {
        originalMessagesCount: messages.length,
        keptMessagesCount: truncated.length,
      },
    };
  }
}
