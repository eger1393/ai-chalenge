import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type AIProvider } from '../ai/dto/ai-params.dto';
import { ContextRepository, ConversationContext } from './repositories/context.repository';
import { TransactionService } from '../database/transaction.service';
import { MessageRepository } from '../conversation/repositories/message.repository';
import { TokenService } from '../ai/token.service';
import { OpenAIService } from '../ai/openai.service';
import { SlidingWindowStrategy } from './strategies/sliding-window.strategy';
import { StickyFactsStrategy } from './strategies/sticky-facts.strategy';
import {
  IContextStrategy,
  ContextStrategyType,
  ContextStrategyResult,
  normalizeContextStrategyType,
} from './strategies/context-strategy.interface';

export interface Fact {
  key: string;
  value: string;
  sourceMessageId?: string;
  updatedAt: string;
}

interface FactsDiff {
  upsert: Array<{ key: string; value: string }>;
  remove: string[];
}

export interface RagRetrievalHint {
  applied: boolean;
  strategyType: ContextStrategyType | null;
  text: string;
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly strategies: Map<ContextStrategyType, IContextStrategy>;

  constructor(
    private readonly contextRepository: ContextRepository,
    private readonly transactionService: TransactionService,
    private readonly messageRepository: MessageRepository,
    private readonly tokenService: TokenService,
    private readonly openaiService: OpenAIService,
    private readonly slidingWindowStrategy: SlidingWindowStrategy,
    private readonly stickyFactsStrategy: StickyFactsStrategy,
  ) {
    this.strategies = new Map<ContextStrategyType, IContextStrategy>([
      ['sliding_window', this.slidingWindowStrategy],
      ['sticky_facts', this.stickyFactsStrategy],
    ]);
  }

  // ── Context CRUD ──

  async getContext(conversationId: string): Promise<ConversationContext | null> {
    const ctx = await this.contextRepository.findByConversationId(conversationId);
    return ctx ? normalizeConversationContext(ctx) : null;
  }

  async createContext(
    conversationId: string,
    strategyType: string,
    strategyData?: Record<string, unknown>,
  ): Promise<ConversationContext> {
    return this.contextRepository.create(
      conversationId,
      normalizeContextStrategyType(strategyType),
      strategyData,
    );
  }

  async updateStrategy(
    conversationId: string,
    strategyType: string,
    strategyData?: Record<string, unknown>,
  ): Promise<void> {
    const ctx = await this.contextRepository.findByConversationId(conversationId);
    if (!ctx) {
      throw new NotFoundException('Context not found for this conversation');
    }
    const currentStrategyType = normalizeContextStrategyType(ctx.strategy_type);
    const nextStrategyType = normalizeContextStrategyType(strategyType);

    if (currentStrategyType !== nextStrategyType) {
      const messageCount = await this.messageRepository.getMessageCount(conversationId);
      if (messageCount > 0) {
        throw new ConflictException(
          'Стратегия контекста фиксируется после первого сообщения',
        );
      }
    }

    const nextStrategyData = strategyData ?? ((ctx.strategy_data as Record<string, unknown>) || {});
    await this.contextRepository.updateStrategyType(
      conversationId,
      nextStrategyType,
      nextStrategyData,
    );
  }

  // ── Prepare context for AI call ──

  async prepareContext(
    conversationId: string,
    systemMessages: Array<{ role: string; content: string }>,
    currentMessage: string,
    model: string,
    maxContextTokens: number,
  ): Promise<ContextStrategyResult> {
    let ctx = await this.contextRepository.findByConversationId(conversationId);
    if (!ctx) {
      ctx = await this.contextRepository.create(conversationId, 'sliding_window');
    }
    ctx = normalizeConversationContext(ctx);

    const strategyType = normalizeContextStrategyType(ctx.strategy_type);
    const strategy = this.strategies.get(strategyType) || this.slidingWindowStrategy;

    const historyMessages = await this.messageRepository.getForContext(conversationId);

    this.logger.debug(
      `Preparing context: strategy=${strategyType}, history=${historyMessages.length}`,
    );

    return strategy.prepareContext({
      conversationId,
      systemMessages,
      historyMessages,
      currentMessage,
      model,
      maxContextTokens,
      strategyData: ctx.strategy_data || {},
      summary: ctx.summary || undefined,
      summaryUpToIndex: ctx.summary_up_to_index,
    });
  }

  async buildRagRetrievalHint(conversationId: string): Promise<RagRetrievalHint> {
    const ctx = await this.contextRepository.findByConversationId(conversationId);
    if (!ctx) {
      return {
        applied: false,
        strategyType: null,
        text: '',
      };
    }

    const strategyType = normalizeContextStrategyType(ctx.strategy_type);
    const strategyData = (ctx.strategy_data as Record<string, unknown>) || {};

    if (strategyType === 'sticky_facts') {
      const facts = ((strategyData.facts as Fact[]) || [])
        .filter((fact) => fact.key?.trim() && fact.value?.trim())
        .slice(-8);

      if (facts.length === 0) {
        return {
          applied: false,
          strategyType,
          text: '',
        };
      }

      return {
        applied: true,
        strategyType,
        text: [
          'Факты диалога для снятия неоднозначности поиска:',
          ...facts.map((fact) => `- ${fact.key}: ${fact.value}`),
        ].join('\n'),
      };
    }

    const historyMessages = await this.messageRepository.getForContext(conversationId);
    const tail = historyMessages
      .slice(-4)
      .map((message) => `[${message.role}] ${truncateForHint(message.content, 240)}`)
      .filter(Boolean);

    if (tail.length === 0) {
      return {
        applied: false,
        strategyType,
        text: '',
      };
    }

    return {
      applied: true,
      strategyType,
      text: ['Последний контекст диалога для снятия неоднозначности поиска:', ...tail].join('\n'),
    };
  }

  // ── Facts CRUD (read-modify-write JSONB) ──

  async getFacts(conversationId: string): Promise<Fact[]> {
    const ctx = await this.contextRepository.findByConversationId(conversationId);
    if (!ctx) return [];
    const data = ctx.strategy_data as Record<string, unknown>;
    return (data?.facts as Fact[]) || [];
  }

  async setFact(
    conversationId: string,
    key: string,
    value: string,
    sourceMessageId?: string,
  ): Promise<void> {
    await this.transactionService.run(async () => {
      let ctx = await this.contextRepository.findByConversationId(conversationId);
      if (!ctx) {
        ctx = await this.contextRepository.create(conversationId, 'sticky_facts', {
          facts: [],
        });
      }

      const data = { ...(ctx.strategy_data as Record<string, unknown>) };
      const facts: Fact[] = [...((data.facts as Fact[]) || [])];

      const now = new Date().toISOString();
      const existingIndex = facts.findIndex(f => f.key === key);
      if (existingIndex >= 0) {
        facts[existingIndex] = { key, value, sourceMessageId, updatedAt: now };
      } else {
        facts.push({ key, value, sourceMessageId, updatedAt: now });
      }

      data.facts = facts;
      await this.contextRepository.updateStrategyData(conversationId, data);
    });
  }

  async deleteFact(conversationId: string, key: string): Promise<void> {
    await this.transactionService.run(async () => {
      const ctx = await this.contextRepository.findByConversationId(conversationId);
      if (!ctx) return;

      const data = { ...(ctx.strategy_data as Record<string, unknown>) };
      const facts: Fact[] = [...((data.facts as Fact[]) || [])];

      const filtered = facts.filter(f => f.key !== key);
      if (filtered.length === facts.length) return; // nothing to delete

      data.facts = filtered;
      await this.contextRepository.updateStrategyData(conversationId, data);
    });
  }

  async extractAndApplyFacts(
    conversationId: string,
    userContent: string,
    assistantReply: string,
    provider: AIProvider,
    model: string,
  ): Promise<void> {
    const existingFacts = await this.getFacts(conversationId);

    const existingFactsText =
      existingFacts.length > 0
        ? existingFacts.map(f => `- ${f.key}: ${f.value}`).join('\n')
        : '(no facts)';

    const prompt = `You are a fact extractor from dialogue. Your task is to extract key facts worth remembering for the future.

Existing facts:
${existingFactsText}

Last user message:
${userContent}

Assistant reply:
${assistantReply}

Analyze the dialogue and return JSON with fact changes:
{
  "upsert": [{"key": "short_key", "value": "fact value"}],
  "remove": ["obsolete_fact_key"]
}

Rules:
- Key is a short description (up to 200 chars), snake_case or plain text
- Value is concise and informative
- Only add truly important facts (names, preferences, decisions, technical details)
- Remove facts that are contradicted or outdated
- If no changes needed, return {"upsert": [], "remove": []}
- Return ONLY valid JSON, no explanations`;

    try {
      const response = await this.openaiService.callOpenAI(
        model,
        [
          { role: 'system', content: 'You extract facts from dialogue. Respond ONLY with valid JSON.' },
          { role: 'user', content: prompt },
        ],
        0.2,
        1024,
        undefined,
        provider,
      );

      const content = response.choices?.[0]?.message?.content || '{"upsert":[],"remove":[]}';

      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const diff: FactsDiff = JSON.parse(jsonStr);
      if (!Array.isArray(diff.upsert)) diff.upsert = [];
      if (!Array.isArray(diff.remove)) diff.remove = [];

      // Apply upserts
      for (const item of diff.upsert) {
        if (item.key && item.value) {
          await this.setFact(conversationId, item.key.slice(0, 200), item.value);
        }
      }

      // Apply removals
      for (const key of diff.remove) {
        if (key) {
          await this.deleteFact(conversationId, key);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to extract facts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ── Summary ──

  async updateSummary(
    conversationId: string,
    summary: string,
    upToIndex: number,
  ): Promise<void> {
    const ctx = await this.contextRepository.findByConversationId(conversationId);
    if (!ctx) {
      throw new NotFoundException('Context not found for this conversation');
    }
    await this.contextRepository.updateSummary(conversationId, summary, upToIndex);
  }
}

function truncateForHint(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeConversationContext(ctx: ConversationContext): ConversationContext {
  const strategyType = normalizeContextStrategyType(ctx.strategy_type);
  if (strategyType === ctx.strategy_type && ctx.active_branch_id == null) {
    return ctx;
  }

  return {
    ...ctx,
    strategy_type: strategyType,
    active_branch_id: null,
  };
}
