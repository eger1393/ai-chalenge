import { Injectable, Logger } from '@nestjs/common';
import { IContextStrategy, ContextStrategyParams, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../../ai/token.service';
import { MODEL_CONTEXT_WINDOWS } from '../../ai/dto/ai-params.dto';

interface Fact {
  key: string;
  value: string;
  sourceMessageId?: string;
  updatedAt: string;
}

@Injectable()
export class StickyFactsStrategy implements IContextStrategy {
  private readonly logger = new Logger(StickyFactsStrategy.name);

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

    // Facts from JSONB strategy_data
    const facts: Fact[] = (strategyData?.facts as Fact[]) || [];

    // Build facts block
    let factsBlock = '';
    if (facts.length > 0) {
      const factsText = facts.map(f => `- ${f.key}: ${f.value}`).join('\n');
      factsBlock = `[Known facts about this conversation]\n${factsText}`;
    }

    // Calculate token budget
    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = maxContextTokens > 0
      ? Math.min(maxContextTokens, modelWindow)
      : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);

    let systemTokens = 0;
    for (const msg of systemMessages) {
      systemTokens += this.tokenService.countTokens(msg.content, model);
    }

    let budgetUsed = systemTokens;

    // Reserve tokens for facts block
    let factsTokens = 0;
    if (factsBlock) {
      factsTokens = this.tokenService.countTokens(factsBlock, model) + 4;
      budgetUsed += factsTokens;
    }

    // Reserve tokens for current message
    const currentMessageTokens = this.tokenService.countTokens(currentMessage, model) + 4;
    budgetUsed += currentMessageTokens;

    // Fill remaining budget with recent messages (from newest to oldest)
    const kept: Array<{ role: string; content: string }> = [];
    for (let i = historyMessages.length - 1; i >= 0; i--) {
      const tokens = this.tokenService.countTokens(historyMessages[i].content, model) + 4;
      if (budgetUsed + tokens > maxBudget) break;
      budgetUsed += tokens;
      kept.unshift(historyMessages[i]);
    }

    // Assemble final messages for prompt builder: facts block + kept history
    const resultMessages: Array<{ role: string; content: string }> = [];
    if (factsBlock) {
      resultMessages.push({ role: 'user', content: factsBlock });
    }
    resultMessages.push(...kept);

    const truncatedCount = historyMessages.length - kept.length;

    // Calculate truncated tokens
    let totalOriginalTokens = systemTokens;
    for (const msg of historyMessages) {
      totalOriginalTokens += this.tokenService.countTokens(msg.content, model);
    }
    totalOriginalTokens += currentMessageTokens;
    const truncatedTokens = Math.max(0, totalOriginalTokens - budgetUsed);

    return {
      strategyType: 'sticky_facts',
      messages: resultMessages,
      truncatedMessages: truncatedCount,
      truncatedTokens,
      contextUsedTokens: budgetUsed,
      contextMaxTokens: contextWindow,
      debugInfo: {
        factsCount: facts.length,
        factsSnapshot: facts.map(f => ({ key: f.key, value: f.value })),
        factsTokens,
        originalMessagesCount: historyMessages.length,
        keptMessagesCount: resultMessages.length,
        keepLast: (strategyData?.keepLast as number) || undefined,
      },
    };
  }
}
