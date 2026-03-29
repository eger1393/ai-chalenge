import { Injectable, Logger } from '@nestjs/common';
import { IContextStrategy, ContextStrategyResult } from './context-strategy.interface';
import { TokenService } from '../services/token.service';
import { OpenAIService } from '../services/openai.service';
import { MODEL_CONTEXT_WINDOWS } from '../dto/ai-params.dto';
import { ConversationService } from '../../conversation/conversation.service';

@Injectable()
export class SlidingWindowStrategy implements IContextStrategy {
  private readonly logger = new Logger(SlidingWindowStrategy.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly openaiService: OpenAIService,
    private readonly conversationService: ConversationService,
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
    let { historyMessages } = params;
    const { conversationId, currentMessage, model, systemPrompt, contextLimit, strategyParams } = params;

    const summaryMode = strategyParams?.summaryMode === 1;
    const summaryKeepLast = (strategyParams?.summaryKeepLast as number) ?? 10;

    // Summary mode: summarize old messages, keep last N
    if (summaryMode && conversationId && historyMessages.length > summaryKeepLast) {
      const cutoff = historyMessages.length - summaryKeepLast;
      const recentMessages = historyMessages.slice(cutoff);

      const { summary: existingSummary, summaryUpToIndex } =
        await this.conversationService.getSummary(conversationId);

      if (summaryUpToIndex < cutoff) {
        const unsummarized = historyMessages.slice(summaryUpToIndex, cutoff);
        const newSummary = await this.generateSummary(existingSummary, unsummarized);
        await this.conversationService.updateSummary(conversationId, newSummary, cutoff);

        historyMessages = [
          { role: 'user', content: `[Краткое содержание предыдущей части диалога]\n${newSummary}` },
          ...recentMessages,
        ];
      } else if (existingSummary) {
        historyMessages = [
          { role: 'user', content: `[Краткое содержание предыдущей части диалога]\n${existingSummary}` },
          ...recentMessages,
        ];
      }
    }

    const allMessages = [...historyMessages, { role: 'user', content: currentMessage }];
    const verbose = strategyParams?.verbose === true;

    // Determine if summary was used
    const summaryUsed = summaryMode && historyMessages.length > 0 &&
      historyMessages[0]?.content?.startsWith('[Краткое содержание предыдущей части диалога]');
    const summaryText = summaryUsed ? historyMessages[0].content : null;

    const result = this.truncateMessages(allMessages, model, systemPrompt, contextLimit);

    if (verbose) {
      const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
      const contextWindow = contextLimit && contextLimit > 0 ? Math.min(contextLimit, modelWindow) : modelWindow;
      const maxBudget = Math.floor(contextWindow * 0.80);

      result.metadata = {
        ...result.metadata,
        originalMessagesCount: allMessages.length,
        keptMessagesCount: result.messages.length,
        budgetMax: maxBudget,
        budgetUsed: result.usedTokens,
        summaryUsed: !!summaryUsed,
        summaryText: summaryText,
      };
    }

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

  private async generateSummary(
    existingSummary: string | null,
    newMessages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const formattedMessages = newMessages
      .map(m => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content.slice(0, 500)}`)
      .join('\n');

    const userContent = existingSummary
      ? `Предыдущее краткое содержание:\n${existingSummary}\n\nНовые сообщения для добавления в сводку:\n${formattedMessages}`
      : `Сообщения для суммаризации:\n${formattedMessages}`;

    const response = await this.openaiService.callOpenAI(
      'gpt-4o-mini',
      [
        { role: 'system', content: 'Ты суммаризатор диалогов. Создай краткое содержание диалога, сохранив ключевые факты, решения, вопросы и контекст. Будь кратким но информативным. Максимум 500 слов.' },
        { role: 'user', content: userContent },
      ],
      0.3,
      2048,
    );

    return response.choices?.[0]?.message?.content || existingSummary || '';
  }
}
