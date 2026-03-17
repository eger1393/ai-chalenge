import { Injectable, BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import OpenAI from 'openai';
import { MessageDto } from './dto/message.dto';

@Injectable()
export class ChatService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
    });
  }

  async sendMessage(dto: MessageDto) {
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '2048');
    const params = dto.params;

    // Extract and clamp parameters
    const temperature = params?.temperature != null
      ? Math.min(2, Math.max(0, params.temperature))
      : 1.0;

    const maxTokens = params?.maxTokens != null
      ? Math.min(envMaxTokens, Math.max(1, params.maxTokens))
      : envMaxTokens;

    const stop = params?.stop?.length
      ? params.stop.slice(0, 4).map((s) => s.slice(0, 64))
      : undefined;

    const systemPrompt = params?.systemPrompt?.trim()
      ? params.systemPrompt.trim().slice(0, 4000)
      : undefined;

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...(dto.conversationHistory || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: dto.message },
    ];

    try {
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(stop ? { stop } : {}),
      });

      const reply = completion.choices[0]?.message?.content || '';
      const usage = completion.usage;

      const appliedParams = {
        temperature,
        maxTokens,
        ...(stop ? { stop } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
      };

      return {
        reply,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
        appliedParams,
      };
    } catch (error: any) {
      if (error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout')) {
        throw new GatewayTimeoutException('OpenAI API timeout');
      }
      throw new BadGatewayException(`OpenAI API error: ${error?.message || 'Unknown error'}`);
    }
  }
}
