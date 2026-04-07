import { Injectable } from '@nestjs/common';
import { encodingForModel, getEncoding } from 'js-tiktoken';

@Injectable()
export class TokenService {
  private encodingCache: Map<string, ReturnType<typeof getEncoding>> = new Map();

  getEncodingForModel(model: string): ReturnType<typeof getEncoding> {
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

  countTokens(text: string, model: string): number {
    if (!text) return 0;
    const enc = this.getEncodingForModel(model);
    return enc.encode(text).length;
  }

  countTokensBreakdown(
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
}
