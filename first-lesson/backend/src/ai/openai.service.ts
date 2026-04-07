import { Injectable, BadGatewayException, GatewayTimeoutException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MODEL_PRICING, DEFAULT_MODEL } from './dto/ai-params.dto';

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
    return this.buildBaseParams(model, messages, temperature, maxTokens, frequencyPenalty) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  }

  private buildBaseParams(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): Record<string, unknown> {
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

  async *callOpenAIStream(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): AsyncGenerator<{
    type: 'delta' | 'done';
    content?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }> {
    const baseParams = this.buildBaseParams(model, messages, temperature, maxTokens, frequencyPenalty);
    const streamParams = {
      ...baseParams,
      stream: true as const,
      stream_options: { include_usage: true },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

    this.logger.debug(`→ OpenAI stream request: model=${model} messages=${messages.length}`);
    const stream = await this.openai.chat.completions.create(streamParams);

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        yield { type: 'delta' as const, content: delta };
      }
      if (chunk.usage) {
        yield {
          type: 'done' as const,
          usage: {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  }

  async *callOpenAIStreamWithTools(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }>,
    temperature: number,
    maxTokens: number,
    tools?: Array<OpenAI.Chat.Completions.ChatCompletionTool>,
  ): AsyncGenerator<{
    type: 'delta' | 'done' | 'tool_calls';
    content?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  }> {
    const params: Record<string, unknown> = {
      model,
      messages,
      temperature,
      ...(this.usesMaxCompletionTokens(model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      stream: true,
      stream_options: { include_usage: true },
      ...(tools && tools.length > 0 ? { tools } : {}),
    };

    this.logger.debug(
      `→ OpenAI stream+tools request: model=${model} messages=${messages.length} tools=${tools?.length ?? 0}`,
    );

    const stream = await this.openai.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    );

    // Accumulate tool calls across chunks
    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
    let hasToolCalls = false;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];

      // Accumulate tool call deltas
      if (choice?.delta?.tool_calls) {
        hasToolCalls = true;
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallAccumulator.set(tc.index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            });
          }
        }
      }

      // Stream text deltas
      const delta = choice?.delta?.content;
      if (delta) {
        yield { type: 'delta' as const, content: delta };
      }

      // On finish_reason === 'tool_calls', emit collected tool calls
      if (choice?.finish_reason === 'tool_calls' && hasToolCalls) {
        const calls = Array.from(toolCallAccumulator.values()).map((tc) => ({
          id: tc.id,
          function: { name: tc.name, arguments: tc.arguments },
        }));
        yield { type: 'tool_calls' as const, toolCalls: calls };
      }

      // Usage info (comes in the last chunk)
      if (chunk.usage) {
        yield {
          type: 'done' as const,
          usage: {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            total_tokens: chunk.usage.total_tokens,
          },
        };
      }
    }
  }
}
