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
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
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
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2048'),
      });

      const reply = completion.choices[0]?.message?.content || '';
      const usage = completion.usage;

      return {
        reply,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
      };
    } catch (error: any) {
      if (error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout')) {
        throw new GatewayTimeoutException('OpenAI API timeout');
      }
      throw new BadGatewayException(`OpenAI API error: ${error?.message || 'Unknown error'}`);
    }
  }
}
