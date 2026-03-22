import { Injectable, BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import OpenAI from 'openai';
import { MessageDto } from './dto/message.dto';
import { ALLOWED_MODELS, DEFAULT_MODEL, MODEL_PRICING } from './dto/ai-params.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';
import { EXPERT_ROLES } from './constants/expert-roles';

@Injectable()
export class ChatService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '60000'),
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
  ): Parameters<typeof this.openai.chat.completions.create>[0] {
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

  private async callOpenAI(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const params = this.buildCompletionParams(model, messages, temperature, maxTokens, frequencyPenalty);
    try {
      return await this.openai.chat.completions.create(params);
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new GatewayTimeoutException('OpenAI API request timed out');
      }
      if (error instanceof OpenAI.RateLimitError) {
        // Retry once after delay on 429
        await new Promise((r) => setTimeout(r, 2000));
        try {
          return await this.openai.chat.completions.create(params);
        } catch (retryError: unknown) {
          const message = retryError instanceof Error ? retryError.message : 'Unknown error';
          throw new BadGatewayException(`OpenAI API rate limit error after retry: ${message}`);
        }
      }
      if (error instanceof OpenAI.APIError) {
        throw new BadGatewayException(`OpenAI API error (${error.status}): ${error.message}`);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadGatewayException(`OpenAI API error: ${message}`);
    }
  }

  async sendMessage(dto: MessageDto) {
    const params = dto.params;
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '4096');

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

    // Map repetitionPenalty (0-2, default 1) to frequency_penalty (-2 to 2, default 0)
    // repetitionPenalty 1.0 = neutral = frequency_penalty 0
    const repetitionPenalty =
      params?.repetitionPenalty != null
        ? Math.max(0, Math.min(2, params.repetitionPenalty))
        : 1.0;
    const frequencyPenalty = Math.max(-2, Math.min(2, (repetitionPenalty - 1.0) * 2));

    const systemPrompt = params?.systemPrompt?.trim()?.slice(0, 4000) || undefined;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...(dto.conversationHistory || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: dto.message },
    ];

    const startTime = Date.now();
    const response = await this.callOpenAI(model, messages, temperature, maxTokens, frequencyPenalty);
    const durationMs = Date.now() - startTime;

    const reply = response.choices?.[0]?.message?.content || '';
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const cost = this.calculateCost(model, promptTokens, completionTokens);

    const appliedParams: Record<string, unknown> = {
      model,
      temperature,
      maxTokens,
    };
    if (repetitionPenalty !== 1.0) appliedParams.repetitionPenalty = repetitionPenalty;
    if (frequencyPenalty !== 0) appliedParams.frequencyPenalty = frequencyPenalty;
    if (systemPrompt) appliedParams.systemPrompt = systemPrompt;

    return {
      reply,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      appliedParams,
      cost,
      durationMs,
    };
  }

  async sendConsilium(dto: ConsiliumMessageDto) {
    const model =
      dto.model && ALLOWED_MODELS.includes(dto.model as any)
        ? dto.model
        : DEFAULT_MODEL;

    const temperature =
      dto.temperature != null
        ? Math.max(0, Math.min(2, dto.temperature))
        : 1.0;

    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '4096');
    const maxTokens =
      dto.maxTokens != null
        ? Math.max(1, Math.min(dto.maxTokens, envMaxTokens))
        : envMaxTokens;

    const history = (dto.conversationHistory || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Resolve system prompts: roleId takes priority over custom systemPrompt
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

    const consiliumStart = Date.now();

    // Phase 1: Send to experts sequentially (rate limit safety)
    const expertResults: Array<{ expert: string; reply: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; cost: number; error?: boolean }> = [];

    for (let i = 0; i < resolvedExperts.length; i++) {
      const expert = resolvedExperts[i];
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

        expertResults.push({
          expert: expert.name,
          reply: response.choices?.[0]?.message?.content || '',
          usage: { promptTokens, completionTokens, totalTokens },
          cost: this.calculateCost(model, promptTokens, completionTokens),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        expertResults.push({
          expert: expert.name,
          reply: `Error: ${message}`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cost: 0,
          error: true,
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < resolvedExperts.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Delay before synthesis
    await new Promise((r) => setTimeout(r, 500));

    // Phase 2: Synthesis - combine all expert opinions
    const synthesisSystemPrompt = `Ты — модератор консилиума экспертов. Тебе даны мнения ${expertResults.length} экспертов по вопросу пользователя. Проанализируй все мнения, выдели общие выводы и различия, и сформируй единый объективный ответ. Укажи, в чём эксперты сходятся и в чём расходятся.`;

    const expertOpinions = expertResults
      .filter((r) => !r.error)
      .map((r) => `### ${r.expert}\n${r.reply}`)
      .join('\n\n');

    const synthesisMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system' as const, content: synthesisSystemPrompt },
      ...history,
      { role: 'user' as const, content: dto.message },
      {
        role: 'assistant' as const,
        content: `Мнения экспертов:\n\n${expertOpinions}`,
      },
      {
        role: 'user' as const,
        content: 'Проанализируй мнения экспертов и сформируй единый ответ.',
      },
    ];

    try {
      const synthesisResponse = await this.callOpenAI(model, synthesisMessages, temperature, maxTokens);

      const synthesisReply = synthesisResponse.choices?.[0]?.message?.content || '';
      const synthesisUsage = synthesisResponse.usage;
      const synthPromptTokens = synthesisUsage?.prompt_tokens || 0;
      const synthCompletionTokens = synthesisUsage?.completion_tokens || 0;
      const synthTotalTokens = synthesisUsage?.total_tokens || 0;
      const synthCost = this.calculateCost(model, synthPromptTokens, synthCompletionTokens);

      // Calculate total usage and cost
      const totalUsage = {
        promptTokens:
          expertResults.reduce((sum, r) => sum + r.usage.promptTokens, 0) + synthPromptTokens,
        completionTokens:
          expertResults.reduce((sum, r) => sum + r.usage.completionTokens, 0) + synthCompletionTokens,
        totalTokens:
          expertResults.reduce((sum, r) => sum + r.usage.totalTokens, 0) + synthTotalTokens,
      };

      const totalCost = expertResults.reduce((sum, r) => sum + r.cost, 0) + synthCost;
      const durationMs = Date.now() - consiliumStart;

      return {
        reply: synthesisReply,
        expertOpinions: expertResults.map((r) => ({
          expert: r.expert,
          reply: r.reply,
          error: r.error || false,
        })),
        usage: totalUsage,
        appliedParams: { model, temperature, maxTokens },
        cost: totalCost,
        durationMs,
      };
    } catch (error: unknown) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadGatewayException(`OpenAI synthesis error: ${message}`);
    }
  }
}
