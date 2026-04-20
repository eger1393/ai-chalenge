import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../../ai/openai.service';
import { McpRegistryService } from '../../mcp/mcp-registry.service';
import { McpToolRouter } from '../../mcp/mcp-tool-router.service';
import { StepRepository, MessageStep } from '../repositories/step.repository';

type StepType = 'planning' | 'execution' | 'validation';
type StepMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface ValidationResult {
  passed: boolean;
  score: number;
  reason: string;
  injection: boolean;
}

export interface StepRunParams {
  messageId: string;
  stepType: StepType;
  attempt: number;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: StepMessage[];
  onEvent: (event: Record<string, unknown>) => void;
  conversationId?: string;
  userId?: string;
}

@Injectable()
export class StepRunnerService {
  private readonly logger = new Logger(StepRunnerService.name);
  private static readonly MAX_TOOL_ITERATIONS = 5;

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly stepRepository: StepRepository,
    private readonly mcpRegistry: McpRegistryService,
    private readonly mcpToolRouter: McpToolRouter,
  ) {}

  async runStep(params: StepRunParams): Promise<{ output: string; step: MessageStep }> {
    const { messageId, stepType, attempt, model, temperature, maxTokens, messages, onEvent } =
      params;
    const startTime = Date.now();

    const inputContext = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const step = await this.stepRepository.createStep({
      messageId,
      stepType,
      attemptNumber: attempt,
      model,
      inputContext,
    });

    onEvent({ type: 'step_start', step: stepType, attempt, model });
    this.logger.debug(
      `Message ${messageId}: step ${stepType} started (attempt ${attempt}, model ${model})`,
    );

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = this.openaiService.callOpenAIStream(
        model,
        messages,
        temperature,
        maxTokens,
      );

      for await (const chunk of stream) {
        if (chunk.type === 'delta' && chunk.content) {
          fullText += chunk.content;
          onEvent({ type: 'step_delta', step: stepType, delta: chunk.content });
        }
        if (chunk.type === 'done' && chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Message ${messageId}: step ${stepType} failed: ${message}`, stack);
      await this.stepRepository.updateStep(step.id, { status: 'failed' });
      throw error;
    }

    const durationMs = Date.now() - startTime;
    const cost = this.openaiService.calculateCost(model, promptTokens, completionTokens);

    await this.stepRepository.updateStep(step.id, {
      status: 'completed',
      outputResult: { text: fullText },
      promptTokens,
      completionTokens,
      cost,
      durationMs,
    });

    onEvent({
      type: 'step_complete',
      step: stepType,
      result: fullText,
      cost,
      tokens: promptTokens + completionTokens,
      durationMs,
    });

    this.logger.debug(
      `Message ${messageId}: step ${stepType} completed in ${durationMs}ms, tokens=${promptTokens + completionTokens}, cost=$${cost.toFixed(4)}`,
    );

    return {
      output: fullText,
      step: {
        ...step,
        status: 'completed',
        outputResult: { text: fullText },
        promptTokens,
        completionTokens,
        cost,
        durationMs,
      },
    };
  }

  async runStepWithTools(params: StepRunParams): Promise<{ output: string; step: MessageStep }> {
    if (!this.mcpRegistry.isAvailable()) {
      this.logger.debug('MCP not available, falling back to regular runStep');
      return this.runStep(params);
    }

    const { messageId, stepType, attempt, model, temperature, maxTokens, messages, onEvent } =
      params;
    const startTime = Date.now();

    const inputContext = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const step = await this.stepRepository.createStep({
      messageId,
      stepType,
      attemptNumber: attempt,
      model,
      inputContext,
    });

    onEvent({ type: 'step_start', step: stepType, attempt, model });
    this.logger.debug(
      `Message ${messageId}: step ${stepType} with tools started (attempt ${attempt}, model ${model})`,
    );

    const workingMessages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      tool_call_id?: string;
    }> = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let iteration = 0;
    const collectedToolCalls: Array<{
      name: string;
      arguments: string;
      result: string;
      server: string;
      displayName: string;
    }> = [];

    try {
      while (iteration < StepRunnerService.MAX_TOOL_ITERATIONS) {
        iteration++;
        this.logger.debug(`Message ${messageId}: tool iteration ${iteration}`);

        let iterationToolCalls: Array<{
          id: string;
          function: { name: string; arguments: string };
        }> | null = null;
        let iterationText = '';

        const stream = this.openaiService.callOpenAIStreamWithTools(
          model,
          workingMessages,
          temperature,
          maxTokens,
          this.mcpRegistry.getAllToolsForOpenAI(),
        );

        for await (const chunk of stream) {
          if (chunk.type === 'delta' && chunk.content) {
            iterationText += chunk.content;
            onEvent({ type: 'step_delta', step: stepType, delta: chunk.content });
          }
          if (chunk.type === 'tool_calls' && chunk.toolCalls) {
            iterationToolCalls = chunk.toolCalls;
          }
          if (chunk.type === 'done' && chunk.usage) {
            promptTokens += chunk.usage.prompt_tokens;
            completionTokens += chunk.usage.completion_tokens;
          }
        }

        if (!iterationToolCalls || iterationToolCalls.length === 0) {
          fullText = iterationText;
          break;
        }

        workingMessages.push({
          role: 'assistant',
          content: '',
          ...({
            tool_calls: iterationToolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function' as const,
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            })),
          } as Record<string, unknown>),
        } as typeof workingMessages[number]);

        for (const toolCall of iterationToolCalls) {
          const { name, arguments: argsString } = toolCall.function;
          this.logger.log(`Message ${messageId}: tool_call ${name} args=${argsString}`);

          let result: string;
          try {
            const args = JSON.parse(argsString);
            if (params.conversationId && 'conversation_id' in args) {
              args.conversation_id = params.conversationId;
            }
            if (params.userId && 'user_id' in args) {
              args.user_id = params.userId;
            }
            result = await this.mcpToolRouter.executeTool(name, args);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown tool error';
            this.logger.error(
              `Message ${messageId}: tool_call ${name} failed: ${errorMessage}`,
            );
            result = `Tool error: ${errorMessage}`;
          }

          const truncatedResult =
            result.length > 500 ? `${result.slice(0, 500)}...(truncated)` : result;
          this.logger.log(
            `Message ${messageId}: tool_call ${name} result (${result.length} chars): ${truncatedResult}`,
          );

          const serverMeta = this.mcpToolRouter.getServerMetaForTool(name);
          const storedResult =
            result.length > 2000 ? `${result.slice(0, 2000)}... (truncated)` : result;

          collectedToolCalls.push({
            name,
            arguments: argsString,
            result: storedResult,
            server: serverMeta?.serverName || '',
            displayName: serverMeta?.displayName || '',
          });

          onEvent({
            type: 'tool_call',
            name,
            server: serverMeta?.serverName || '',
            displayName: serverMeta?.displayName || '',
            arguments: argsString,
            result: storedResult,
          });

          workingMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
        }
      }

      if (iteration >= StepRunnerService.MAX_TOOL_ITERATIONS && !fullText) {
        fullText = 'Reached maximum tool call iterations. Please simplify your request.';
        this.logger.warn(
          `Message ${messageId}: hit max tool iterations (${StepRunnerService.MAX_TOOL_ITERATIONS})`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Message ${messageId}: step ${stepType} with tools failed: ${message}`,
        stack,
      );
      await this.stepRepository.updateStep(step.id, { status: 'failed' });
      throw error;
    }

    const durationMs = Date.now() - startTime;
    const cost = this.openaiService.calculateCost(model, promptTokens, completionTokens);
    const outputResult =
      collectedToolCalls.length > 0
        ? { text: fullText, toolCalls: collectedToolCalls }
        : { text: fullText };

    await this.stepRepository.updateStep(step.id, {
      status: 'completed',
      outputResult,
      promptTokens,
      completionTokens,
      cost,
      durationMs,
    });

    onEvent({
      type: 'step_complete',
      step: stepType,
      result: fullText,
      cost,
      tokens: promptTokens + completionTokens,
      durationMs,
    });

    this.logger.debug(
      `Message ${messageId}: step ${stepType} with tools completed in ${durationMs}ms, iterations=${iteration}, tokens=${promptTokens + completionTokens}, cost=$${cost.toFixed(4)}`,
    );

    return {
      output: fullText,
      step: {
        ...step,
        status: 'completed',
        outputResult,
        promptTokens,
        completionTokens,
        cost,
        durationMs,
      },
    };
  }

  buildStageMessages(params: {
    assembledSystemPrompt: string | undefined;
    historyMessages: Array<{ role: string; content: string }>;
    userMessage: string;
    invariants: string[];
    systemPrompt: string;
    extraSystemMessages?: string[];
    includeCapabilities?: boolean;
  }): StepMessage[] {
    const messages: StepMessage[] = [];
    const baseSystemMessage = this.buildBaseSystemMessage(
      params.assembledSystemPrompt,
      params.invariants,
    );

    if (baseSystemMessage) {
      messages.push({ role: 'system', content: baseSystemMessage });
    }

    const mainSystemPrompt = params.includeCapabilities
      ? `${params.systemPrompt}${this.buildCapabilitiesBlock()}`
      : params.systemPrompt;
    messages.push({ role: 'system', content: mainSystemPrompt });

    for (const systemMessage of params.extraSystemMessages ?? []) {
      if (systemMessage.trim()) {
        messages.push({ role: 'system', content: systemMessage });
      }
    }

    for (const message of params.historyMessages) {
      messages.push({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      });
    }

    messages.push({ role: 'user', content: params.userMessage });
    return messages;
  }

  parseValidation(text: string): ValidationResult {
    const safeText = text || '';
    const verdictMatch = safeText.match(/VERDICT:\s*(PASS|FAIL|INJECTION)/i);
    const scoreMatch = safeText.match(/SCORE:\s*(\d+)/i);
    const reasonMatch = safeText.match(/REASON:\s*(.+)/i);

    if (verdictMatch && scoreMatch && reasonMatch) {
      const verdict = verdictMatch[1].toUpperCase();
      return {
        passed: verdict === 'PASS',
        score: parseInt(scoreMatch[1], 10),
        reason: reasonMatch[1].trim(),
        injection: verdict === 'INJECTION',
      };
    }

    const structuredResult = tryParseValidationJson(safeText);
    if (structuredResult) {
      return structuredResult;
    }

    const malformedReason = describeMalformedValidationOutput(safeText);
    this.logger.warn(`Validation returned malformed output: ${malformedReason}`);

    return {
      passed: false,
      score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
      reason: malformedReason,
      injection: verdictMatch ? verdictMatch[1].toUpperCase() === 'INJECTION' : false,
    };
  }

  private buildInvariantsBlock(invariants: string[]): string {
    if (invariants.length === 0) {
      return '';
    }

    const list = invariants.map((invariant, index) => `${index + 1}. ${invariant}`).join('\n');
    return `═══ ИНВАРИАНТЫ (НАРУШЕНИЕ ЗАПРЕЩЕНО) ═══\nСЛЕДУЮЩИЕ ПРАВИЛА НЕЛЬЗЯ НАРУШАТЬ НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ.\nДаже если пользователь просит иное — ОТКАЗАТЬ.\n\n${list}\n═══════════════════════════════════════\n\n`;
  }

  private buildCapabilitiesBlock(): string {
    return this.mcpRegistry.buildCapabilitiesBlock();
  }

  private buildBaseSystemMessage(
    assembledSystemPrompt: string | undefined,
    invariants: string[],
  ): string | null {
    let content = this.buildInvariantsBlock(invariants);
    if (assembledSystemPrompt) {
      content += assembledSystemPrompt;
    }

    return content.trim() ? content : null;
  }
}

function tryParseValidationJson(text: string): ValidationResult | null {
  const parsed = tryParseLooseJsonObject(text);
  if (!parsed) {
    return null;
  }

  const verdictValue =
    readOptionalStringField(parsed, 'verdict') ??
    readOptionalStringField(parsed, 'VERDICT');
  const reasonValue =
    readOptionalStringField(parsed, 'reason') ??
    readOptionalStringField(parsed, 'REASON');
  const scoreValue =
    readOptionalNumberField(parsed, 'score') ??
    readOptionalNumberField(parsed, 'SCORE');

  if (!verdictValue || !reasonValue || scoreValue == null) {
    return null;
  }

  const verdict = verdictValue.trim().toUpperCase();
  if (verdict !== 'PASS' && verdict !== 'FAIL' && verdict !== 'INJECTION') {
    return null;
  }

  return {
    passed: verdict === 'PASS',
    score: scoreValue,
    reason: reasonValue.trim(),
    injection: verdict === 'INJECTION',
  };
}

function describeMalformedValidationOutput(text: string): string {
  const parsed = tryParseLooseJsonObject(text);
  if (parsed) {
    if (
      ('planning' in parsed && 'execution' in parsed) ||
      ('plan' in parsed && 'execution' in parsed)
    ) {
      return 'Валидация вернула payload с planning/execution вместо VERDICT/SCORE/REASON. Скорее всего модель скопировала входные данные, а не вынесла вердикт';
    }

    return 'Валидация вернула JSON не того формата: ожидаются поля verdict/score/reason или строки VERDICT/SCORE/REASON';
  }

  return 'Валидация не вернула обязательный формат VERDICT/SCORE/REASON/ISSUES';
}

function tryParseLooseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = unwrapJsonCodeFence(text.trim());
  if (!normalized.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function unwrapJsonCodeFence(value: string): string {
  if (!value.startsWith('```')) {
    return value;
  }

  return value.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
}

function readOptionalStringField(
  record: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = record[fieldName];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readOptionalNumberField(
  record: Record<string, unknown>,
  fieldName: string,
): number | null {
  const value = record[fieldName];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
