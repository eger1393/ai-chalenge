import { Injectable, Logger } from '@nestjs/common';
import { IContextStrategy, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../services/token.service';
import { FactsService } from '../services/facts.service';
import { MODEL_CONTEXT_WINDOWS } from '../dto/ai-params.dto';

@Injectable()
export class StickyFactsStrategy implements IContextStrategy {
  private readonly logger = new Logger(StickyFactsStrategy.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly factsService: FactsService,
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
    const { conversationId, historyMessages, currentMessage, model, systemPrompt, contextLimit } = params;

    // Load facts from DB
    const facts = await this.factsService.getFacts(conversationId);

    // Build facts block
    let factsBlock = '';
    if (facts.length > 0) {
      const factsText = facts.map(f => `- ${f.fact_key}: ${f.fact_value}`).join('\n');
      factsBlock = `[Известные факты о диалоге]\n${factsText}`;
    }

    // Calculate token budget
    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = contextLimit && contextLimit > 0 ? Math.min(contextLimit, modelWindow) : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);

    let budgetUsed = systemPrompt ? this.tokenService.countTokens(systemPrompt, model) : 0;

    // Reserve tokens for facts block
    if (factsBlock) {
      budgetUsed += this.tokenService.countTokens(factsBlock, model) + 4;
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

    // Assemble final messages: factsBlock (as user message) + kept history + current message
    const resultMessages: Array<{ role: string; content: string }> = [];
    if (factsBlock) {
      resultMessages.push({ role: 'user', content: factsBlock });
    }
    resultMessages.push(...kept);
    resultMessages.push({ role: 'user', content: currentMessage });

    const truncatedCount = historyMessages.length - kept.length;

    // Calculate truncated tokens
    let totalOriginalTokens = systemPrompt ? this.tokenService.countTokens(systemPrompt, model) : 0;
    for (const msg of historyMessages) {
      totalOriginalTokens += this.tokenService.countTokens(msg.content, model);
    }
    totalOriginalTokens += currentMessageTokens;
    const truncatedTokens = Math.max(0, totalOriginalTokens - budgetUsed);

    return {
      messages: resultMessages,
      usedTokens: budgetUsed,
      truncatedCount,
      truncatedTokens,
      metadata: { factsCount: facts.length },
    };
  }
}
