import { Injectable, BadGatewayException, BadRequestException, GatewayTimeoutException, Logger } from '@nestjs/common';
import { MessageDto } from './dto/message.dto';
import { TestDialogueDto } from './dto/test-dialogue.dto';
import { ALLOWED_MODELS, DEFAULT_MODEL, MODEL_CONTEXT_WINDOWS } from './dto/ai-params.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';
import { EXPERT_ROLES } from './constants/expert-roles';
import { ConversationService } from '../conversation/conversation.service';
import { TokenService } from './services/token.service';
import { OpenAIService } from './services/openai.service';
import { ContextStrategyService } from './services/context-strategy.service';
import { FactsService } from './services/facts.service';
import { BranchService } from './services/branch.service';
import { ContextStrategyType } from './strategies/context-strategy.interface';
import { MemoryAssemblerService } from './services/memory-assembler.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly tokenService: TokenService,
    private readonly openaiService: OpenAIService,
    private readonly contextStrategyService: ContextStrategyService,
    private readonly factsService: FactsService,
    private readonly branchService: BranchService,
    private readonly memoryAssemblerService: MemoryAssemblerService,
  ) {}

  async sendMessage(dto: MessageDto, username?: string) {
    const params = dto.params;
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');

    const model =
      params?.model && ALLOWED_MODELS.includes(params.model as any)
        ? params.model
        : DEFAULT_MODEL;

    const temperature =
      params?.temperature != null
        ? Math.max(0, Math.min(2, params.temperature))
        : 1.0;

    const maxTokens =
      params?.maxTokens != null
        ? Math.max(1, Math.min(params.maxTokens, envMaxTokens))
        : envMaxTokens;

    const repetitionPenalty =
      params?.repetitionPenalty != null
        ? Math.max(0, Math.min(2, params.repetitionPenalty))
        : 1.0;
    const frequencyPenalty = Math.max(-2, Math.min(2, (repetitionPenalty - 1.0) * 2));

    const userSystemPrompt = params?.systemPrompt?.trim()?.slice(0, 4000) || undefined;
    const contextLimit = params?.contextLimit != null && params.contextLimit > 0 ? params.contextLimit : undefined;

    let conversationId = dto.conversationId;
    let contextWindow: { model: string; maxTokens: number; usedTokens: number; usagePercent: number } | undefined;

    let historyMessages: Array<{ role: string; content: string }>;
    let contextStrategy: ContextStrategyType = 'sliding_window';

    if (conversationId) {
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        throw new BadRequestException('Conversation not found');
      }
      if (username && conversation.username !== username) {
        throw new BadRequestException('Conversation not found');
      }

      // Determine context strategy from conversation (supports both camelCase alias and snake_case)
      contextStrategy = (conversation.contextStrategy || conversation.context_strategy || 'sliding_window') as ContextStrategyType;

      // Update strategy on first message if user chose differently
      if (params?.contextStrategy && params.contextStrategy !== contextStrategy) {
        const messageCount = await this.conversationService.getMessageCount(conversationId);
        if (messageCount === 0) {
          contextStrategy = params.contextStrategy as ContextStrategyType;
          await this.conversationService.updateStrategy(conversationId, contextStrategy);
        }
      }

      const dbMessages = await this.conversationService.getMessagesForContext(conversationId);
      historyMessages = dbMessages;
    } else if (dto.conversationHistory) {
      historyMessages = dto.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      historyMessages = [];
    }

    // Assemble 3-layer memory: long-term (profile) + working (task) + short-term (user system prompt)
    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      username: username || 'anonymous',
      conversationId,
      userSystemPrompt,
      model,
    });
    const assembledSystemPrompt = memoryResult.systemPrompt || undefined;

    let truncatedMessages: Array<{ role: string; content: string }>;
    let usedTokens: number;
    let truncatedCount = 0;
    let truncatedTokensCount = 0;
    let strategyMetadata: Record<string, unknown> | undefined;

    const verbose = params?.strategyParams?.verbose === true;

    if (conversationId) {
      const result = await this.contextStrategyService.prepareContext(
        contextStrategy,
        {
          conversationId,
          historyMessages,
          currentMessage: dto.message,
          model,
          systemPrompt: assembledSystemPrompt,
          contextLimit,
          strategyParams: {
            ...(verbose ? { verbose: true } : {}),
          },
        },
      );

      truncatedMessages = result.messages;
      usedTokens = result.usedTokens;
      truncatedCount = result.truncatedCount;
      truncatedTokensCount = result.truncatedTokens;
      strategyMetadata = result.metadata;

      const modelWindowSize = MODEL_CONTEXT_WINDOWS[model] || 128000;
      const windowSize = contextLimit ? Math.min(contextLimit, modelWindowSize) : modelWindowSize;
      contextWindow = {
        model,
        maxTokens: windowSize,
        usedTokens,
        usagePercent: Math.round((usedTokens / windowSize) * 100),
      };
    } else {
      truncatedMessages = [...historyMessages, { role: 'user', content: dto.message }];
      usedTokens = 0;
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...(assembledSystemPrompt ? [{ role: 'system' as const, content: assembledSystemPrompt }] : []),
      ...truncatedMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const tokenBreakdown = this.tokenService.countTokensBreakdown(
      historyMessages,
      dto.message,
      assembledSystemPrompt,
      model,
    );

    this.logger.log(`sendMessage: model=${model} strategy=${contextStrategy} msgLen=${dto.message.length}`);

    const startTime = Date.now();
    const response = await this.openaiService.callOpenAI(model, messages, temperature, maxTokens, frequencyPenalty);
    const durationMs = Date.now() - startTime;

    const finishReason = response.choices?.[0]?.finish_reason;
    const reply = response.choices?.[0]?.message?.content ?? '';
    if (!reply) {
      this.logger.warn(`Empty reply from OpenAI (model=${model} finish_reason=${finishReason})`);
    } else if (finishReason === 'length') {
      this.logger.warn(`Reply truncated by token limit (model=${model} maxTokens=${maxTokens})`);
    }

    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const cost = this.openaiService.calculateCost(model, promptTokens, completionTokens);

    this.logger.log(`sendMessage done: model=${model} tokens=${totalTokens} cost=$${cost.toFixed(4)} duration=${durationMs}ms`);

    // Determine branchId for message saving
    let branchId: string | undefined = dto.branchId;
    if (conversationId && contextStrategy === 'branching') {
      const activeBranch = await this.branchService.getActiveBranch(conversationId);
      if (activeBranch) {
        branchId = activeBranch.id;
      }
    }

    let assistantMsg: { id: string } | undefined;

    if (conversationId) {
      const userMsg = await this.conversationService.addMessage(conversationId, 'user', dto.message, {
        tokenCount: tokenBreakdown.currentMessageTokens,
        branchId,
      });
      assistantMsg = await this.conversationService.addMessage(conversationId, 'assistant', reply, {
        model,
        tokenCount: totalTokens,
        promptTokens,
        completionTokens,
        cost,
        durationMs,
        currentMessageTokens: tokenBreakdown.currentMessageTokens,
        historyTokens: tokenBreakdown.historyTokens,
        appliedModel: model,
        appliedTemperature: temperature,
        appliedMaxTokens: maxTokens,
        contextUsedTokens: contextWindow?.usedTokens || 0,
        contextMaxTokens: contextWindow?.maxTokens || 0,
        truncatedMessages: truncatedCount,
        truncatedTokens: truncatedTokensCount,
        branchId,
      });

      // Sticky facts: extract facts after getting reply
      let factsAfterForDebug: Array<{ key: string; value: string }> | undefined;
      if (contextStrategy === 'sticky_facts') {
        try {
          const existingFacts = await this.factsService.getFacts(conversationId);
          const diff = await this.factsService.extractFactsFromMessage(
            conversationId,
            dto.message,
            reply,
            existingFacts,
          );
          await this.factsService.applyFactsDiff(conversationId, diff, userMsg.id);
          const currentFacts = await this.factsService.getFacts(conversationId);
          factsAfterForDebug = currentFacts.map(f => ({ key: f.fact_key, value: f.fact_value }));
        } catch (err) {
          this.logger.warn(`Facts extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Save debug data for all conversations
      if (assistantMsg) {
        const debugData: Record<string, unknown> = {
          strategyType: contextStrategy,
          contextMessagesCount: strategyMetadata?.originalMessagesCount ?? historyMessages.length,
          contextMessagesAfterTruncation: strategyMetadata?.keptMessagesCount ?? truncatedMessages.length,
          tokenBreakdown: tokenBreakdown,
          strategyMetadata: strategyMetadata ?? null,
          memoryLayers: memoryResult.layers.length > 0 ? memoryResult.layers : null,
        };
        if (contextStrategy === 'sticky_facts') {
          debugData.factsSnapshot = strategyMetadata?.factsSnapshot ?? null;
          debugData.factsAfter = factsAfterForDebug ?? null;
        }
        if (contextStrategy === 'branching' && strategyMetadata) {
          debugData.branchInfo = {
            branchName: strategyMetadata.branchName,
            branchMessagesCount: strategyMetadata.branchMessagesCount,
          };
        }
        await this.conversationService.saveDebugData(assistantMsg.id, debugData);
      }

      const messageCount = await this.conversationService.getMessageCount(conversationId);
      if (messageCount <= 2) {
        const title = dto.message.slice(0, 50) + (dto.message.length > 50 ? '...' : '');
        await this.conversationService.updateTitle(conversationId, title);
      }
    }

    const appliedParams: Record<string, unknown> = {
      model,
      temperature,
      maxTokens,
    };
    if (repetitionPenalty !== 1.0) appliedParams.repetitionPenalty = repetitionPenalty;
    if (frequencyPenalty !== 0) appliedParams.frequencyPenalty = frequencyPenalty;
    if (assembledSystemPrompt) appliedParams.systemPrompt = assembledSystemPrompt;

    const result: Record<string, unknown> = {
      reply,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        currentMessageTokens: tokenBreakdown.currentMessageTokens,
        historyTokens: tokenBreakdown.historyTokens,
        systemPromptTokens: tokenBreakdown.systemPromptTokens,
      },
      appliedParams,
      cost,
      durationMs,
    };

    if (conversationId) {
      result.conversationId = conversationId;
      result.assistantMessageId = assistantMsg?.id;
      const totals = await this.conversationService.getConversationTotals(conversationId);
      result.conversationTotals = totals;
    }
    if (contextWindow) {
      result.contextWindow = contextWindow;
    }
    if (truncatedCount > 0) {
      result.truncation = {
        droppedMessages: truncatedCount,
        droppedTokens: truncatedTokensCount,
      };
    }
    if (strategyMetadata) {
      result.strategyMetadata = strategyMetadata;
    }
    if (memoryResult.layers.length > 0) {
      result.memoryLayers = memoryResult.layers;
    }

    return result;
  }

  async generateTestDialogue(
    dto: TestDialogueDto,
    username: string,
    onEvent: (event: Record<string, unknown>) => void,
  ) {
    const params = dto.params;
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');

    const model =
      params?.model && ALLOWED_MODELS.includes(params.model as any)
        ? params.model
        : DEFAULT_MODEL;

    const temperature =
      params?.temperature != null
        ? Math.max(0, Math.min(2, params.temperature))
        : 1.0;

    const maxTokens =
      params?.maxTokens != null
        ? Math.max(1, Math.min(params.maxTokens, envMaxTokens))
        : envMaxTokens;

    const systemPrompt = params?.systemPrompt?.trim()?.slice(0, 4000) || undefined;
    const contextStrategy: ContextStrategyType =
      (params?.contextStrategy as ContextStrategyType) || 'sliding_window';

    const conv = await this.conversationService.create(
      username,
      dto.topic.slice(0, 50),
      model,
      systemPrompt,
      contextStrategy,
      true,
      dto.topic,
      dto.pairsCount,
    );

    onEvent({ type: 'started', conversationId: conv.id, totalPairs: dto.pairsCount });

    const simulatorModel = dto.simulatorModel || 'gpt-4.1-nano';
    const dialogHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (let i = 0; i < dto.pairsCount; i++) {
      // Generate user message via simulator
      const simulatorMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        {
          role: 'system',
          content: `Ты играешь роль реального пользователя в диалоге на тему: ${dto.topic}. Генерируй естественные сообщения: вопросы, уточнения, комментарии. Не раскрывай что ты AI. Варьируй длину сообщений. Отвечай ТОЛЬКО текстом сообщения пользователя, без метаданных.`,
        },
        ...dialogHistory.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: 'Сгенерируй следующее сообщение пользователя.' },
      ];

      const simResponse = await this.openaiService.callOpenAI(simulatorModel, simulatorMessages, 0.9, 1024);
      const userMsg = simResponse.choices?.[0]?.message?.content?.trim() || `Расскажи подробнее о ${dto.topic}`;

      onEvent({ type: 'user_message', pair: i, content: userMsg });

      // Send the user message via sendMessage with verbose
      const messageDto: MessageDto = {
        message: userMsg,
        conversationId: conv.id,
        params: {
          model: params?.model,
          temperature: params?.temperature,
          maxTokens: params?.maxTokens,
          repetitionPenalty: params?.repetitionPenalty,
          systemPrompt: params?.systemPrompt,
          contextLimit: params?.contextLimit,
          summaryMode: params?.summaryMode,
          summaryKeepLast: params?.summaryKeepLast,
          strategyParams: { verbose: true },
        },
      };

      const sendResult = await this.sendMessage(messageDto, username);

      // Save debug data — for sticky_facts, load facts AFTER extraction (sendMessage already extracted them)
      const assistantMessageId = sendResult.assistantMessageId as string | undefined;
      const meta = sendResult.strategyMetadata as Record<string, unknown> | undefined;

      // For sticky_facts: get current facts (after extraction happened inside sendMessage)
      let factsAfter: Array<{ key: string; value: string }> | null = null;
      if (contextStrategy === 'sticky_facts') {
        const currentFacts = await this.factsService.getFacts(conv.id);
        factsAfter = currentFacts.map(f => ({ key: f.fact_key, value: f.fact_value }));
      }

      if (assistantMessageId) {
        const debugData: Record<string, unknown> = {
          strategyType: contextStrategy,
          contextMessagesCount: meta?.originalMessagesCount ?? 0,
          contextMessagesAfterTruncation: meta?.keptMessagesCount ?? 0,
          tokenBreakdown: sendResult.usage,
          strategyMetadata: sendResult.strategyMetadata ?? null,
        };

        if (contextStrategy === 'sticky_facts') {
          debugData.factsSnapshot = meta?.factsSnapshot ?? null; // facts BEFORE this message
          debugData.factsAfter = factsAfter; // facts AFTER extraction
        }
        if (contextStrategy === 'branching' && meta) {
          debugData.branchInfo = {
            branchName: meta.branchName,
            branchMessagesCount: meta.branchMessagesCount,
          };
        }

        // Memory layers from 3-level memory assembly
        if (sendResult.memoryLayers) {
          debugData.memoryLayers = sendResult.memoryLayers;
        }

        await this.conversationService.saveDebugData(assistantMessageId, debugData);
      }

      dialogHistory.push({ role: 'user', content: userMsg });
      dialogHistory.push({ role: 'assistant', content: sendResult.reply as string });

      onEvent({
        type: 'assistant_message',
        pair: i,
        content: sendResult.reply,
        debug: {
          ...((sendResult.strategyMetadata as Record<string, unknown>) ?? {}),
          factsAfter: factsAfter,
        },
        usage: sendResult.usage,
        cost: sendResult.cost,
        durationMs: sendResult.durationMs,
        contextWindow: sendResult.contextWindow,
        truncation: sendResult.truncation,
      });
    }

    const totals = await this.conversationService.getConversationTotals(conv.id);
    onEvent({ type: 'complete', conversationId: conv.id, totalPairs: dto.pairsCount, totals });
  }

  async sendConsilium(dto: ConsiliumMessageDto, username?: string) {
    const model =
      dto.model && ALLOWED_MODELS.includes(dto.model as any)
        ? dto.model
        : DEFAULT_MODEL;

    const temperature =
      dto.temperature != null
        ? Math.max(0, Math.min(2, dto.temperature))
        : 1.0;

    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');
    const maxTokens =
      dto.maxTokens != null
        ? Math.max(1, Math.min(dto.maxTokens, envMaxTokens))
        : envMaxTokens;

    let conversationId = dto.conversationId;

    let history: Array<{ role: 'user' | 'assistant'; content: string }>;

    if (conversationId) {
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        throw new BadRequestException('Conversation not found');
      }
      if (username && conversation.username !== username) {
        throw new BadRequestException('Conversation not found');
      }

      const dbMessages = await this.conversationService.getMessagesForContext(conversationId);
      history = dbMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } else {
      history = (dto.conversationHistory || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    }

    const resolvedExperts = dto.experts
      .map((expert) => {
        let resolvedPrompt: string | undefined;
        if (expert.roleId) {
          const role = EXPERT_ROLES.find((r) => r.id === expert.roleId);
          resolvedPrompt = role?.systemPrompt;
        }
        if (!resolvedPrompt && expert.systemPrompt) {
          resolvedPrompt = expert.systemPrompt;
        }
        return resolvedPrompt
          ? { name: expert.name, systemPrompt: resolvedPrompt }
          : null;
      })
      .filter((e): e is { name: string; systemPrompt: string } => e !== null);

    // Assemble memory for consilium: long-term + working layers as prefix for each expert
    // No userSystemPrompt passed — only long-term (profile) and working (task) layers
    const consiliumMemory = await this.memoryAssemblerService.assembleMemory({
      username: username || 'anonymous',
      conversationId,
      model,
    });
    const memoryPrefix = consiliumMemory.systemPrompt || '';

    this.logger.log(`sendConsilium: model=${model} experts=${resolvedExperts.length}`);

    const consiliumStart = Date.now();

    const expertResults: Array<{ expert: string; reply: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; cost: number; error?: boolean }> = [];

    for (let i = 0; i < resolvedExperts.length; i++) {
      const expert = resolvedExperts[i];
      this.logger.log(`  Expert [${i + 1}/${resolvedExperts.length}]: ${expert.name}`);
      const expertSystemPrompt = memoryPrefix
        ? `${memoryPrefix}\n\n---\n\n${expert.systemPrompt}`
        : expert.systemPrompt;
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system' as const, content: expertSystemPrompt },
        ...history,
        { role: 'user' as const, content: dto.message },
      ];

      try {
        const response = await this.openaiService.callOpenAI(model, messages, temperature, maxTokens);
        const usage = response.usage;
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const totalTokens = usage?.total_tokens || 0;
        const expertReply = response.choices?.[0]?.message?.content || '';

        expertResults.push({
          expert: expert.name,
          reply: expertReply,
          usage: { promptTokens, completionTokens, totalTokens },
          cost: this.openaiService.calculateCost(model, promptTokens, completionTokens),
        });
        this.logger.log(`  Expert ${expert.name}: tokens=${totalTokens} replyLen=${expertReply.length}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`  Expert ${expert.name} failed: ${message}`);
        expertResults.push({
          expert: expert.name,
          reply: `Error: ${message}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cost: 0,
          error: true,
        });
      }

      if (i < resolvedExperts.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    await new Promise((r) => setTimeout(r, 500));

    this.logger.log(`  Synthesis phase (${expertResults.filter(r => !r.error).length} valid opinions)`);
    const synthesisSystemPrompt = `Ты — модератор консилиума экспертов. Тебе даны мнения ${expertResults.length} экспертов по вопросу пользователя. Проанализируй все мнения, выдели общие выводы и различия, и сформируй единый объективный ответ. Укажи, в чём эксперты сходятся и в чём расходятся.`;

    const expertOpinions = expertResults
      .filter((r) => !r.error)
      .map((r) => `### ${r.expert}\n${r.reply}`)
      .join('\n\n');

    const synthesisMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system' as const, content: synthesisSystemPrompt },
      ...history,
      { role: 'user' as const, content: dto.message },
      { role: 'assistant' as const, content: `Мнения экспертов:\n\n${expertOpinions}` },
      { role: 'user' as const, content: 'Проанализируй мнения экспертов и сформируй единый ответ.' },
    ];

    try {
      const synthesisResponse = await this.openaiService.callOpenAI(model, synthesisMessages, temperature, maxTokens);

      const synthesisReply = synthesisResponse.choices?.[0]?.message?.content || '';
      const synthesisUsage = synthesisResponse.usage;
      const synthPromptTokens = synthesisUsage?.prompt_tokens || 0;
      const synthCompletionTokens = synthesisUsage?.completion_tokens || 0;
      const synthTotalTokens = synthesisUsage?.total_tokens || 0;
      const synthCost = this.openaiService.calculateCost(model, synthPromptTokens, synthCompletionTokens);

      const totalUsage = {
        promptTokens: expertResults.reduce((sum, r) => sum + r.usage.promptTokens, 0) + synthPromptTokens,
        completionTokens: expertResults.reduce((sum, r) => sum + r.usage.completionTokens, 0) + synthCompletionTokens,
        totalTokens: expertResults.reduce((sum, r) => sum + r.usage.totalTokens, 0) + synthTotalTokens,
      };

      const totalCost = expertResults.reduce((sum, r) => sum + r.cost, 0) + synthCost;
      const durationMs = Date.now() - consiliumStart;

      this.logger.log(`sendConsilium done: model=${model} totalTokens=${totalUsage.totalTokens} cost=$${totalCost.toFixed(4)} duration=${durationMs}ms`);

      if (conversationId) {
        await this.conversationService.addMessage(conversationId, 'user', dto.message);

        const assistantMsg = await this.conversationService.addMessage(
          conversationId, 'assistant', synthesisReply,
          { model, tokenCount: totalUsage.totalTokens, promptTokens: totalUsage.promptTokens, completionTokens: totalUsage.completionTokens, cost: totalCost, isConsilium: true, durationMs, appliedModel: model, appliedTemperature: temperature, appliedMaxTokens: maxTokens },
        );

        await this.conversationService.addExpertOpinions(
          assistantMsg.id,
          expertResults.map((r) => ({ expertName: r.expert, content: r.reply, isError: r.error || false })),
        );

        const messageCount = await this.conversationService.getMessageCount(conversationId);
        if (messageCount <= 2) {
          const title = dto.message.slice(0, 50) + (dto.message.length > 50 ? '...' : '');
          await this.conversationService.updateTitle(conversationId, title);
        }
      }

      const result: Record<string, unknown> = {
        reply: synthesisReply,
        expertOpinions: expertResults.map((r) => ({ expert: r.expert, reply: r.reply, error: r.error || false })),
        usage: totalUsage,
        appliedParams: { model, temperature, maxTokens },
        cost: totalCost,
        durationMs,
      };

      if (conversationId) {
        result.conversationId = conversationId;
        const totals = await this.conversationService.getConversationTotals(conversationId);
        result.conversationTotals = totals;
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Synthesis failed: ${message}`);
      throw new BadGatewayException(`OpenAI synthesis error: ${message}`);
    }
  }
}
