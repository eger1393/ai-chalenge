import { Injectable, BadGatewayException, GatewayTimeoutException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  AIProvider,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MODEL_PRICING,
} from './dto/ai-params.dto';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly clients = new Map<AIProvider, OpenAI>();

  calculateCost(
    provider: AIProvider,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): number {
    if (provider === 'ollama') {
      return 0;
    }

    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
    return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
  }

  usesMaxCompletionTokens(provider: AIProvider, model: string): boolean {
    return provider === 'openai' && /^gpt-5/.test(model);
  }

  buildCompletionParams(
    provider: AIProvider,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    return this.buildBaseParams(provider, model, messages, temperature, maxTokens, frequencyPenalty) as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
  }

  private buildBaseParams(
    provider: AIProvider,
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
      ...(this.usesMaxCompletionTokens(provider, model)
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
    provider: AIProvider = DEFAULT_PROVIDER,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const params = this.buildCompletionParams(provider, model, messages, temperature, maxTokens, frequencyPenalty);
    const client = this.getClient(provider);
    this.logger.debug(
      `→ LLM request: provider=${provider} model=${model} messages=${messages.length} maxTokens=${maxTokens} temp=${temperature}`,
    );
    const t0 = Date.now();
    try {
      const response = await client.chat.completions.create(params);
      this.logger.debug(`← LLM response: provider=${provider} ${Date.now() - t0}ms | tokens=${response.usage?.total_tokens ?? '?'} | finish=${response.choices?.[0]?.finish_reason}`);
      return response;
    } catch (error: unknown) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        this.logger.error(`LLM timeout after ${Date.now() - t0}ms (provider=${provider}, model=${model})`);
        throw new GatewayTimeoutException(`${provider} request timed out after ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      if (error instanceof OpenAI.RateLimitError) {
        this.logger.warn(`LLM rate limit hit, retrying after 2s (provider=${provider}, model=${model})`);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const response = await client.chat.completions.create(params);
          this.logger.debug(`← LLM retry response: provider=${provider} ${Date.now() - t0}ms | tokens=${response.usage?.total_tokens ?? '?'}`);
          return response;
        } catch (retryError: unknown) {
          const message = retryError instanceof Error ? retryError.message : 'Unknown error';
          this.logger.error(`LLM rate limit retry failed: provider=${provider} ${message}`);
          throw new BadGatewayException(`${provider} API rate limit error after retry: ${message}`);
        }
      }
      if (error instanceof OpenAI.APIError) {
        this.logger.error(`LLM API error provider=${provider} status=${error.status}: ${error.message}`);
        throw new BadGatewayException(`${provider} API error (${error.status}): ${error.message}`);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`LLM unexpected error provider=${provider}: ${message}`);
      throw new BadGatewayException(`${provider} API error: ${message}`);
    }
  }

  async *callOpenAIStream(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    frequencyPenalty?: number,
    provider: AIProvider = DEFAULT_PROVIDER,
  ): AsyncGenerator<{
    type: 'delta' | 'done';
    content?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }> {
    const baseParams = this.buildBaseParams(provider, model, messages, temperature, maxTokens, frequencyPenalty);
    const streamParams = {
      ...baseParams,
      stream: true as const,
      stream_options: { include_usage: true },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

    const client = this.getClient(provider);
    this.logger.debug(`→ LLM stream request: provider=${provider} model=${model} messages=${messages.length}`);
    const stream = await client.chat.completions.create(streamParams);

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
    provider: AIProvider = DEFAULT_PROVIDER,
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
      ...(this.usesMaxCompletionTokens(provider, model)
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      stream: true,
      stream_options: { include_usage: true },
      ...(tools && tools.length > 0 ? { tools } : {}),
    };

    this.logger.debug(
      `→ LLM stream+tools request: provider=${provider} model=${model} messages=${messages.length} tools=${tools?.length ?? 0}`,
    );

    const client = this.getClient(provider);
    const stream = await client.chat.completions.create(
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

  private getClient(provider: AIProvider): OpenAI {
    const cached = this.clients.get(provider);
    if (cached) {
      return cached;
    }

    const client = this.createClient(provider);
    this.clients.set(provider, client);
    return client;
  }

  private createClient(provider: AIProvider): OpenAI {
    if (provider === 'ollama') {
      const apiKey = process.env.OLLAMA_API_KEY?.trim();
      if (!apiKey) {
        throw new BadGatewayException('OLLAMA_API_KEY is not configured');
      }
      if (apiKey === '<OLLAMA_API_KEY>' || /your_ollama_api_key_here/i.test(apiKey)) {
        throw new BadGatewayException(
          'OLLAMA_API_KEY contains a placeholder value. Replace it with the real Ollama gateway key.',
        );
      }

      return new OpenAI({
        apiKey,
        baseURL: process.env.OLLAMA_BASE_URL || 'https://dev-gpu-server.superlook.ai/v1',
        timeout: parseInt(process.env.OLLAMA_TIMEOUT || process.env.OPENAI_TIMEOUT || '600000', 10),
        maxRetries: 0,
        defaultHeaders: {
          'X-GPU-Service': 'ollama',
          'X-API-Key': apiKey,
        },
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new BadGatewayException('OPENAI_API_KEY is not configured');
    }

    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '600000', 10),
      maxRetries: 0,
    });
  }
}
