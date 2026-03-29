import { Injectable, Logger } from '@nestjs/common';
import { IContextStrategy, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../services/token.service';
import { BranchService } from '../services/branch.service';
import { MODEL_CONTEXT_WINDOWS } from '../dto/ai-params.dto';

@Injectable()
export class BranchingStrategy implements IContextStrategy {
  private readonly logger = new Logger(BranchingStrategy.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly branchService: BranchService,
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
    const { conversationId, currentMessage, model, systemPrompt, contextLimit } = params;

    // Ensure main branch exists
    await this.branchService.ensureMainBranch(conversationId);

    // Get active branch and its messages
    const activeBranch = await this.branchService.getActiveBranch(conversationId);
    const branchId = activeBranch?.id;

    let branchMessages: Array<{ role: string; content: string }>;
    if (branchId) {
      branchMessages = await this.branchService.getMessagesForBranch(conversationId, branchId);
    } else {
      // Fallback to provided history
      branchMessages = params.historyMessages;
    }

    const allMessages = [...branchMessages, { role: 'user', content: currentMessage }];
    const verbose = params.strategyParams?.verbose === true;

    // Truncate by token budget (same logic as sliding window)
    const result = this.truncateByTokens(allMessages, model, systemPrompt, contextLimit, branchId);

    if (verbose) {
      result.metadata = {
        ...result.metadata,
        branchName: activeBranch?.name || 'main',
        branchMessagesCount: branchMessages.length,
        originalMessagesCount: allMessages.length,
        keptMessagesCount: result.messages.length,
      };
    }

    return result;
  }

  private truncateByTokens(
    messages: Array<{ role: string; content: string }>,
    model: string,
    systemPrompt?: string,
    contextLimit?: number,
    branchId?: string,
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
      return {
        messages,
        usedTokens: totalTokens,
        truncatedCount: 0,
        truncatedTokens: 0,
        metadata: { branchId },
      };
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
      metadata: { branchId },
    };
  }
}
