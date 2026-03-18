import { Injectable, BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import { MessageDto } from './dto/message.dto';
import { ALLOWED_MODELS, DEFAULT_MODEL } from './dto/ai-params.dto';
import { ConsiliumMessageDto } from './dto/consilium.dto';

@Injectable()
export class ChatService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: parseInt(process.env.GIGACHAT_TIMEOUT || '30000'),
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const authKey = process.env.GIGACHAT_AUTH_KEY;
    if (!authKey) {
      throw new Error('GIGACHAT_AUTH_KEY is not set');
    }

    try {
      const response = await this.httpClient.post(
        'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        'scope=GIGACHAT_API_PERS',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authKey}`,
            'RqUID': uuidv4(),
          },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = response.data.expires_at;
      return this.accessToken!;
    } catch (error: any) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      throw new BadGatewayException(
        `GigaChat OAuth error: ${error.response?.data?.message || error.message}`,
      );
    }
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

    const envMaxTokens = parseInt(process.env.GIGACHAT_MAX_TOKENS || '2048');
    const maxTokens =
      dto.maxTokens != null
        ? Math.max(1, Math.min(dto.maxTokens, envMaxTokens))
        : envMaxTokens;

    const history = (dto.conversationHistory || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Phase 1: Send to all experts in parallel
    const expertPromises = dto.experts.map(async (expert) => {
      const messages = [
        { role: 'system' as const, content: expert.systemPrompt },
        ...history,
        { role: 'user' as const, content: dto.message },
      ];

      try {
        const token = await this.getAccessToken();
        const response = await this.httpClient.post(
          'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
          { model, messages, temperature, max_tokens: maxTokens },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );
        return {
          expert: expert.name,
          reply: response.data.choices?.[0]?.message?.content || '',
          usage: response.data.usage || {},
        };
      } catch (error: any) {
        if (error.response?.status === 401) {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
        }
        return {
          expert: expert.name,
          reply: `Ошибка: ${error.response?.data?.message || error.message}`,
          usage: {},
          error: true,
        };
      }
    });

    const expertResults = await Promise.all(expertPromises);

    // Phase 2: Synthesis - combine all expert opinions
    const synthesisSystemPrompt = `Ты — модератор консилиума экспертов. Тебе даны мнения ${expertResults.length} экспертов по вопросу пользователя. Проанализируй все мнения, выдели общие выводы и различия, и сформируй единый объективный ответ. Укажи, в чём эксперты сходятся и в чём расходятся.`;

    const expertOpinions = expertResults
      .filter((r) => !r.error)
      .map((r) => `### ${r.expert}\n${r.reply}`)
      .join('\n\n');

    const synthesisMessages = [
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
      const token = await this.getAccessToken();
      const synthesisResponse = await this.httpClient.post(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        { model, messages: synthesisMessages, temperature, max_tokens: maxTokens },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const synthesisReply =
        synthesisResponse.data.choices?.[0]?.message?.content || '';
      const synthesisUsage = synthesisResponse.data.usage || {};

      // Calculate total usage
      const totalUsage = {
        promptTokens:
          expertResults.reduce(
            (sum, r) => sum + (r.usage.prompt_tokens || 0),
            0,
          ) + (synthesisUsage.prompt_tokens || 0),
        completionTokens:
          expertResults.reduce(
            (sum, r) => sum + (r.usage.completion_tokens || 0),
            0,
          ) + (synthesisUsage.completion_tokens || 0),
        totalTokens:
          expertResults.reduce(
            (sum, r) => sum + (r.usage.total_tokens || 0),
            0,
          ) + (synthesisUsage.total_tokens || 0),
      };

      return {
        reply: synthesisReply,
        expertOpinions: expertResults.map((r) => ({
          expert: r.expert,
          reply: r.reply,
          error: r.error || false,
        })),
        usage: totalUsage,
        appliedParams: { model, temperature, maxTokens },
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiresAt = 0;
      }
      throw new BadGatewayException(
        `GigaChat synthesis error: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async sendMessage(dto: MessageDto) {
    const params = dto.params;
    const envMaxTokens = parseInt(process.env.GIGACHAT_MAX_TOKENS || '2048');

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

    const systemPrompt = params?.systemPrompt?.trim()?.slice(0, 4000) || undefined;

    const messages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...(dto.conversationHistory || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: dto.message },
    ];

    try {
      const token = await this.getAccessToken();

      const response = await this.httpClient.post(
        'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          repetition_penalty: repetitionPenalty,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data;
      const reply = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || {};

      const appliedParams: Record<string, unknown> = {
        model,
        temperature,
        maxTokens,
      };
      if (repetitionPenalty !== 1.0) appliedParams.repetitionPenalty = repetitionPenalty;
      if (systemPrompt) appliedParams.systemPrompt = systemPrompt;

      return {
        reply,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        appliedParams,
      };
    } catch (error: any) {
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) {
        throw error;
      }

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new GatewayTimeoutException('GigaChat API request timed out');
      }

      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiresAt = 0;
      }

      throw new BadGatewayException(
        `GigaChat API error: ${error.response?.data?.message || error.message}`,
      );
    }
  }
}
