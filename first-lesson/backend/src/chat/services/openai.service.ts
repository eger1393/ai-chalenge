import { Injectable, BadGatewayException, GatewayTimeoutException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MODEL_PRICING, DEFAULT_MODEL } from '../dto/ai-params.dto';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '600000'),
      maxRetries: 0,
    });
  }

  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
    return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
  }

  usesMaxCompletionTokens(model: string): boolean {
    return /^gpt-5/.test(model);
  }

  buildCompletionParams(
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

  async callOpenAI(
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
}
