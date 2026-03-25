import { Injectable, BadGatewayException, BadRequestException, GatewayTimeoutException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { encodingForModel, getEncoding } from 'js-tiktoken';
import { MessageDto } from './dto/message.dto';
import { ALLOWED_MODELS, DEFAULT_MODEL, MODEL_PRICING, MODEL_CONTEXT_WINDOWS } from './dto/ai-params.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';
import { EXPERT_ROLES } from './constants/expert-roles';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private openai: OpenAI;
  private encodingCache: Map<string, ReturnType<typeof getEncoding>> = new Map();

  constructor(private readonly conversationService: ConversationService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '600000'),
      maxRetries: 0,
    });
  }

  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
    return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
  }

  // gpt-5.x and newer models require max_completion_tokens instead of max_tokens
  private usesMaxCompletionTokens(model: string): boolean {
    return /^gpt-5/.test(model);
  }

  private buildCompletionParams(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    return {
      model,
      messages,
      temperature,
      ...(this.usesMaxCompletionTokens(model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      ...(frequencyPenalty != null && frequencyPenalty !== 0 ? { frequency_penalty: frequencyPenalty } : {}),
    };
  }

  private getEncodingForModel(model: string): ReturnType<typeof getEncoding> {
    const cached = this.encodingCache.get(model);
    if (cached) return cached;

    let enc: ReturnType<typeof getEncoding>;
    try {
      enc = encodingForModel(model as Parameters<typeof encodingForModel>[0]);
    } catch {
      enc = getEncoding('cl100k_base');
    }
    this.encodingCache.set(model, enc);
    return enc;
  }

  private countTokens(text: string, model: string): number {
    const enc = this.getEncodingForModel(model);
    return enc.encode(text).length;
  }

  private countTokensBreakdown(
    historyMessages: Array<{ role: string; content: string }>,
    currentMessage: string,
    systemPrompt: string | undefined,
    model: string,
  ): { currentMessageTokens: number; historyTokens: number; systemPromptTokens: number } {
    const currentMessageTokens = this.countTokens(currentMessage, model);

    let historyTokens = 0;
    for (const msg of historyMessages) {
      historyTokens += this.countTokens(msg.content, model) + 4; // +4 overhead per message
    }

    const systemPromptTokens = systemPrompt ? this.countTokens(systemPrompt, model) : 0;

    return { currentMessageTokens, historyTokens, systemPromptTokens };
  }

  private truncateMessages(
    messages: Array<{ role: string; content: string }>,
    model: string,
    systemPrompt?: string,
    contextLimit?: number,
  ): { messages: Array<{ role: string; content: string }>; usedTokens: number; truncatedCount: number; truncatedTokens: number } {
    const modelWindow = MODEL_CONTEXT_WINDOWS[model] || 128000;
    const contextWindow = contextLimit && contextLimit > 0 ? Math.min(contextLimit, modelWindow) : modelWindow;
    const maxBudget = Math.floor(contextWindow * 0.80);
    const warningThreshold = Math.floor(contextWindow * 0.85);

    let totalTokens = systemPrompt ? this.countTokens(systemPrompt, model) : 0;
    for (const msg of messages) {
      totalTokens += this.countTokens(msg.content, model);
    }

    if (totalTokens <= warningThreshold) {
      return { messages, usedTokens: totalTokens, truncatedCount: 0, truncatedTokens: 0 };
    }

    const first2 = messages.slice(0, 2);
    const rest = messages.slice(2);

    let budgetUsed = systemPrompt ? this.countTokens(systemPrompt, model) : 0;
    for (const msg of first2) {
      budgetUsed += this.countTokens(msg.content, model);
    }

    const kept: Array<{ role: string; content: string }> = [];
    for (let i = rest.length - 1; i >= 0; i--) {
      const tokens = this.countTokens(rest[i].content, model);
      if (budgetUsed + tokens > maxBudget) break;
      budgetUsed += tokens;
      kept.unshift(rest[i]);
    }

    const truncated = [...first2, ...kept];
    return { messages: truncated, usedTokens: budgetUsed, truncatedCount: messages.length - truncated.length, truncatedTokens: totalTokens - budgetUsed };
  }

  private async callOpenAI(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const params = this.buildCompletionParams(model, messages, temperature, maxTokens, frequencyPenalty);
    this.logger.debug(`→ OpenAI request: model=${model} messages=${messages.length} maxTokens=${maxTokens} temp=${temperature}`);
    const t0 = Date.now();
    try {
      const response = await this.openai.chat.completions.create(params);
      this.logger.debug(`← OpenAI response: ${Date.now() - t0}ms | tokens=${response.usage?.total_tokens ?? '?'} | finish=${response.choices?.[0]?.finish_reason}`);
      return response;
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        this.logger.error(`OpenAI timeout after ${Date.now() - t0}ms (model=${model})`);
        throw new GatewayTimeoutException(`OpenAI request timed out after ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      if (error instanceof OpenAI.RateLimitError) {
        this.logger.warn(`OpenAI rate limit hit, retrying after 2s (model=${model})`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const response = await this.openai.chat.completions.create(params);
          this.logger.debug(`← OpenAI retry response: ${Date.now() - t0}ms | tokens=${response.usage?.total_tokens ?? '?'}`);
          return response;
        } catch (retryError: unknown) {
          const message = retryError instanceof Error ? retryError.message : 'Unknown error';
          this.logger.error(`OpenAI rate limit retry failed: ${message}`);
          throw new BadGatewayException(`OpenAI API rate limit error after retry: ${message}`);
        }
      }
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`OpenAI API error ${error.status}: ${error.message}`);
        throw new BadGatewayException(`OpenAI API error (${error.status}): ${error.message}`);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OpenAI unexpected error: ${message}`);
      throw new BadGatewayException(`OpenAI API error: ${message}`);
    }
  }

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

    const systemPrompt = params?.systemPrompt?.trim()?.slice(0, 4000) || undefined;
    const contextLimit = params?.contextLimit != null && params.contextLimit > 0 ? params.contextLimit : undefined;

    let conversationId = dto.conversationId;
    let contextWindow: { model: string; maxTokens: number; usedTokens: number; usagePercent: number } | undefined;

    let historyMessages: Array<{ role: string; content: string }>;

    if (conversationId) {
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        throw new BadRequestException('Conversation not found');
      }
      if (username && conversation.username !== username) {
        throw new BadRequestException('Conversation not found');
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

    const allMessages = [...historyMessages, { role: 'user', content: dto.message }];

    let truncatedMessages: Array<{ role: string; content: string }>;
    let usedTokens: number;
    let truncatedCount = 0;
    let truncatedTokensCount = 0;

    if (conversationId) {
      const result = this.truncateMessages(allMessages, model, systemPrompt, contextLimit);
      truncatedMessages = result.messages;
      usedTokens = result.usedTokens;
      truncatedCount = result.truncatedCount;
      truncatedTokensCount = result.truncatedTokens;

      const modelWindowSize = MODEL_CONTEXT_WINDOWS[model] || 128000;
      const windowSize = contextLimit ? Math.min(contextLimit, modelWindowSize) : modelWindowSize;
      contextWindow = {
        model,
        maxTokens: windowSize,
        usedTokens,
        usagePercent: Math.round((usedTokens / windowSize) * 100),
      };
    } else {
      truncatedMessages = allMessages;
      usedTokens = 0;
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...truncatedMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const tokenBreakdown = this.countTokensBreakdown(
      historyMessages,
      dto.message,
      systemPrompt,
      model,
    );

    this.logger.log(`sendMessage: model=${model} msgLen=${dto.message.length}`);

    const startTime = Date.now();
    const response = await this.callOpenAI(model, messages, temperature, maxTokens, frequencyPenalty);
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
    const cost = this.calculateCost(model, promptTokens, completionTokens);

    this.logger.log(`sendMessage done: model=${model} tokens=${totalTokens} cost=$${cost.toFixed(4)} duration=${durationMs}ms`);

    if (conversationId) {
      await this.conversationService.addMessage(conversationId, 'user', dto.message, {
        tokenCount: tokenBreakdown.currentMessageTokens,
      });
      await this.conversationService.addMessage(conversationId, 'assistant', reply, {
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
      });

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
    if (systemPrompt) appliedParams.systemPrompt = systemPrompt;

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

    return result;
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

    this.logger.log(`sendConsilium: model=${model} experts=${resolvedExperts.length}`);

    const consiliumStart = Date.now();

    const expertResults: Array<{ expert: string; reply: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; cost: number; error?: boolean }> = [];

    for (let i = 0; i < resolvedExperts.length; i++) {
      const expert = resolvedExperts[i];
      this.logger.log(`  Expert [${i + 1}/${resolvedExperts.length}]: ${expert.name}`);
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system' as const, content: expert.systemPrompt },
        ...history,
        { role: 'user' as const, content: dto.message },
      ];

      try {
        const response = await this.callOpenAI(model, messages, temperature, maxTokens);
        const usage = response.usage;
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const totalTokens = usage?.total_tokens || 0;
        const expertReply = response.choices?.[0]?.message?.content || '';

        expertResults.push({
          expert: expert.name,
          reply: expertReply,
          usage: { promptTokens, completionTokens, totalTokens },
          cost: this.calculateCost(model, promptTokens, completionTokens),
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
      const synthesisResponse = await this.callOpenAI(model, synthesisMessages, temperature, maxTokens);

      const synthesisReply = synthesisResponse.choices?.[0]?.message?.content || '';
      const synthesisUsage = synthesisResponse.usage;
      const synthPromptTokens = synthesisUsage?.prompt_tokens || 0;
      const synthCompletionTokens = synthesisUsage?.completion_tokens || 0;
      const synthTotalTokens = synthesisUsage?.total_tokens || 0;
      const synthCost = this.calculateCost(model, synthPromptTokens, synthCompletionTokens);

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
