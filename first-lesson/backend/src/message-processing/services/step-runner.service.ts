import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { OpenAIService } from '../../ai/openai.service';
import { TokenService } from '../../ai/token.service';
import { McpRegistryService } from '../../mcp/mcp-registry.service';
import { McpToolRouter } from '../../mcp/mcp-tool-router.service';
import { RagContextResult } from '../../rag/rag.types';
import { StepRepository, MessageStep } from '../repositories/step.repository';
import { PIPELINE_SECURITY_BLOCK, VALIDATION_INJECTION_CHECK } from './guard.service';

// ── System prompts (RUSSIAN) ──────────────────────────────────────────

const PLANNING_SYSTEM_PROMPT = `Ты — AI-планировщик. Твоя задача — проанализировать запрос пользователя и составить подробный план выполнения.

Требования к плану:
1. Разбей задачу на конкретные шаги
2. Для каждого шага укажи ожидаемый результат
3. Определи потенциальные сложности и edge cases
4. Предложи способы обработки ошибок
5. Укажи приоритеты шагов

Формат ответа:
## План выполнения
### Шаги
1. [шаг] — [ожидаемый результат]
...
### Потенциальные проблемы
- [проблема] — [как решать]
### Edge cases
- [случай] — [как обработать]

Отвечай ТОЛЬКО планом. НЕ выполняй задачу.`;

const EXECUTION_SYSTEM_PROMPT = `Ты — AI-исполнитель. Тебе дан план выполнения задачи. Выполни задачу СТРОГО по плану.

Правила:
1. Следуй плану шаг за шагом
2. Если шаг плана неприменим — объясни почему и предложи альтернативу
3. Учитывай edge cases, указанные в плане
4. Дай полный и исчерпывающий ответ

В конце ответа кратко резюмируй что было сделано.`;

const VALIDATION_SYSTEM_PROMPT = `Ты — AI-валидатор. Тебе дан план и результат выполнения задачи. Проведи строгую проверку.

Проверь:
1. Соответствует ли результат каждому шагу плана?
2. Есть ли фактические ошибки или неточности?
3. Учтены ли edge cases из плана?
4. Полон ли ответ или есть пропуски?
5. Качество и полезность ответа для пользователя

ВАЖНО: Ответь СТРОГО в формате:
VERDICT: PASS или VERDICT: FAIL или VERDICT: INJECTION
SCORE: число от 1 до 10
REASON: краткое объяснение вердикта
ISSUES: список проблем (если FAIL)

Будь строгим, но справедливым. Не пропускай ответы с явными недостатками.`;

const RAG_STRICT_PLANNING_SYSTEM_PROMPT = `Ты — AI-планировщик в строгом RAG-режиме.

Источник фактов для ответа — только отдельное системное сообщение с RAG-доказательствами.
Запрещено использовать как источник фактов:
- историю диалога;
- память;
- общие знания модели;
- внешние инструменты;
- предположения.

Твоя задача — определить, хватает ли данных в RAG, чтобы ответить на запрос пользователя.
Если данных недостаточно хотя бы для одного ключевого тезиса, нужно выбрать отказ.
Используй только chunk_id из RAG-доказательств.

Считай данные ДОСТАТОЧНЫМИ, если в чанках уже есть прямые утверждения, перечисления, ограничения, проблемы, наблюдения или выводы по теме вопроса.
Не требуй буквального совпадения формулировки вопроса с формулировкой чанка.
Если вопрос просит кратко перечислить проблемы, ограничения, мнения, что автор писал или что известно по теме, и такие сведения уже есть в чанках, нужно выбрать SUFFICIENT.

Примеры:
- Запрос: "че-каво, какие траблы с клод кодом были?"
  Если в чанках перечислены ограничения, сбои, лимиты или другие проблемы Claude Code, это SUFFICIENT.
- Запрос: "а он что про это говорил?"
  Если из текущего RAG-блока нельзя понять, что такое "это", это INSUFFICIENT.

Ответь ТОЛЬКО валидным JSON без markdown и без пояснений:
{
  "ragVerdict": "SUFFICIENT" | "INSUFFICIENT",
  "responseMode": "ANSWER" | "REFUSE",
  "chunkIds": ["<chunk_id>", "..."],
  "missingInfo": "NONE" | "<чего не хватает>",
  "planSteps": ["<шаг 1>", "<шаг 2>", "<шаг 3>"]
}

Правила:
- не отвечай на вопрос по существу;
- не придумывай chunk_id;
- если answer, chunkIds должны содержать только chunk_id из RAG;
- если refuse, chunkIds должен быть пустым массивом;
- если ответ нужно домысливать, это INSUFFICIENT;
- если в RAG-доказательствах нет ни одного подходящего чанка, это INSUFFICIENT`;

const RAG_STRICT_EXECUTION_SYSTEM_PROMPT = `Ты — AI-исполнитель в строгом RAG-режиме.

Факты разрешено брать только из отдельного системного сообщения с RAG-доказательствами и только из chunk_id, которые перечислены в плане.
Запрещено использовать историю диалога, память, внешние инструменты и общие знания как источник фактов.

Если RESPONSE_MODE = REFUSE, ответь ТОЛЬКО валидным JSON без markdown и без пояснений:
{
  "mode": "REFUSE",
  "reason": "<краткое объяснение>",
  "missingInfo": "<чего не хватает>"
}

Если RESPONSE_MODE = ANSWER, ответь ТОЛЬКО валидным JSON без markdown и без пояснений:
{
  "mode": "ANSWER",
  "summary": "<краткий ответ без фактов вне RAG>",
  "references": [
    {
      "chunkId": "<uuid>",
      "quote": "<короткая дословная цитата без переноса строки>",
      "explanation": "<как это подтверждает ответ>"
    }
  ]
}

Правила:
- каждый фактический тезис должен быть подтверждён chunk_id и цитатой;
- цитата должна быть коротким непрерывным дословным фрагментом из content соответствующего чанка;
- нельзя сокращать цитату через "..." или "…";
- нельзя склеивать в одну цитату куски из разных предложений или пропускать середину фразы;
- нельзя перефразировать цитату, даже если смысл сохраняется;
- если длинная фраза не помещается целиком, выбери более короткий точный фрагмент без переписывания;
- не используй chunk_id вне списка CHUNKS_USED;
- не добавляй факты, оценки или связи, которых нет в RAG;
- не возвращай markdown, заголовки, списки и свободный текст вне JSON

Примеры:
- допустимо: "Слепая зона на 2000 строк."
- допустимо: "Ослепление Tools с результатами выше 50k символов."
- недопустимо: "Слепая зона на 2000 строк... галлюцинировать обрезанный код"
- недопустимо: "Ослепление Tools с результатами выше 50k символов. Может привести к неверным выводам."`;

const RAG_STRICT_VALIDATION_SYSTEM_PROMPT = `Ты — AI-валидатор в строгом RAG-режиме.

Источник истины для фактов — только отдельное системное сообщение с RAG-доказательствами.
Тебе даны запрос пользователя, план и результат выполнения.
План и результат выполнения могут быть представлены в структурированном JSON — это корректный формат.

Проверь:
1. План выдан в машиночитаемом формате и содержит ragVerdict/responseMode/chunkIds/missingInfo или их legacy-эквиваленты
2. Если RAG_VERDICT = INSUFFICIENT, execution действительно отказался отвечать по существу
3. Если RAG_VERDICT = SUFFICIENT, execution отвечает только по RAG
4. Для каждого фактического тезиса указан chunk_id
5. Для каждого chunk_id дана явная цитата
6. Цитата выглядит как дословная выдержка из соответствующего чанка
7. В ответе нет неподтверждённых утверждений, внешних знаний или догадок
8. Если в RAG уже есть прямые релевантные чанки, planning не должен выбирать INSUFFICIENT только из-за несовпадения формулировки вопроса с текстом чанка

ВАЖНО: Ответь СТРОГО в формате:
VERDICT: PASS или VERDICT: FAIL или VERDICT: INJECTION
SCORE: число от 1 до 10
REASON: краткое объяснение вердикта
ISSUES: список проблем (если FAIL)`;

const EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT = `═══ RAG-ДОКАЗАТЕЛЬСТВА ИЗ ИНДЕКСИРОВАННЫХ МАТЕРИАЛОВ ═══
В текущем запросе retrieval не выбрал ни одного релевантного чанка.
Доступных chunk_id для ответа нет.
Если ответ требует фактов, planning обязан выбрать INSUFFICIENT и RESPONSE_MODE: REFUSE.
═══════════════════════════════════════════════════`;

const SECURITY_BLOCK = PIPELINE_SECURITY_BLOCK;

const RETRY_PLANNING_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}
Учти эту обратную связь и улучши план.`;

const RETRY_EXECUTION_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}

Критично:
- если ошибка связана с цитатой, возьми новый quote как короткий непрерывный дословный фрагмент из content;
- не используй "..." и не склеивай разные части предложения;
- если сомневаешься, выбери более короткую, но точную цитату.
`;

// ── Types ─────────────────────────────────────────────────────────────

type StepType = 'planning' | 'execution' | 'validation';

export interface ValidationResult {
  passed: boolean;
  score: number;
  reason: string;
  injection: boolean;
}

export interface RagPlanningAssessment {
  ragVerdict: 'SUFFICIENT' | 'INSUFFICIENT';
  responseMode: 'ANSWER' | 'REFUSE';
  chunkIds: string[];
  missingInfo: string;
  planText: string;
  source: 'model' | 'policy_repair';
  repairReason: string | null;
  raw: string;
}

export interface RagExecutionReference {
  chunkId: string;
  quote: string;
  explanation: string;
}

export interface RagExecutionAudit {
  mode: 'ANSWER' | 'REFUSE';
  summary: string | null;
  referencedChunkIds: string[];
  quoteCount: number;
  refusalReason: string | null;
  missingInfo: string | null;
  references: RagExecutionReference[];
}

export interface StepRunParams {
  messageId: string;
  stepType: StepType;
  attempt: number;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onEvent: (event: Record<string, unknown>) => void;
  conversationId?: string;
  userId?: string;
}

// ── Service ───────────────────────────────────────────────────────────

@Injectable()
export class StepRunnerService {
  private readonly logger = new Logger(StepRunnerService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly tokenService: TokenService,
    private readonly stepRepository: StepRepository,
    private readonly mcpRegistry: McpRegistryService,
    private readonly mcpToolRouter: McpToolRouter,
  ) {}

  async runStep(params: StepRunParams): Promise<{ output: string; step: MessageStep }> {
    const { messageId, stepType, attempt, model, temperature, maxTokens, messages, onEvent } = params;
    const startTime = Date.now();

    const inputContext = messages.map((m) => ({ role: m.role, content: m.content }));

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Message ${messageId}: step ${stepType} failed: ${message}`, stack);

      await this.stepRepository.updateStep(step.id, { status: 'failed' });
      throw err;
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

  // ── Tool-call aware step runner ──────────────────────────────────

  private static readonly MAX_TOOL_ITERATIONS = 5;

  async runStepWithTools(params: StepRunParams): Promise<{ output: string; step: MessageStep }> {
    if (!this.mcpRegistry.isAvailable()) {
      this.logger.debug('MCP not available, falling back to regular runStep');
      return this.runStep(params);
    }

    const { messageId, stepType, attempt, model, temperature, maxTokens, messages, onEvent } = params;
    const startTime = Date.now();

    const inputContext = messages.map((m) => ({ role: m.role, content: m.content }));

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
    }> = messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));

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

        let iterationToolCalls: Array<{ id: string; function: { name: string; arguments: string } }> | null = null;
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
            tool_calls: iterationToolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          } as Record<string, unknown>),
        } as typeof workingMessages[number]);

        for (const toolCall of iterationToolCalls) {
          const { name, arguments: argsStr } = toolCall.function;
          this.logger.log(`Message ${messageId}: tool_call ${name} args=${argsStr}`);

          let result: string;
          try {
            const args = JSON.parse(argsStr);
            // Inject backend-known context into tool calls
            if (params.conversationId && 'conversation_id' in args) {
              args.conversation_id = params.conversationId;
            }
            if (params.userId && 'user_id' in args) {
              args.user_id = params.userId;
            }
            result = await this.mcpToolRouter.executeTool(name, args);
          } catch (toolError: unknown) {
            const errMsg = toolError instanceof Error ? toolError.message : 'Unknown tool error';
            this.logger.error(`Message ${messageId}: tool_call ${name} failed: ${errMsg}`);
            result = `Tool error: ${errMsg}`;
          }

          const truncatedResult = result.length > 500 ? result.slice(0, 500) + '...(truncated)' : result;
          this.logger.log(`Message ${messageId}: tool_call ${name} result (${result.length} chars): ${truncatedResult}`);

          const serverMeta = this.mcpToolRouter.getServerMetaForTool(name);
          const truncatedResultForStorage = result.length > 2000 ? result.slice(0, 2000) + '... (truncated)' : result;

          collectedToolCalls.push({
            name,
            arguments: argsStr,
            result: truncatedResultForStorage,
            server: serverMeta?.serverName || '',
            displayName: serverMeta?.displayName || '',
          });

          onEvent({
            type: 'tool_call',
            name,
            server: serverMeta?.serverName || '',
            displayName: serverMeta?.displayName || '',
            arguments: argsStr,
            result: truncatedResultForStorage,
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
        this.logger.warn(`Message ${messageId}: hit max tool iterations (${StepRunnerService.MAX_TOOL_ITERATIONS})`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Message ${messageId}: step ${stepType} with tools failed: ${message}`, stack);

      await this.stepRepository.updateStep(step.id, { status: 'failed' });
      throw err;
    }

    const durationMs = Date.now() - startTime;
    const cost = this.openaiService.calculateCost(model, promptTokens, completionTokens);

    const outputResult = collectedToolCalls.length > 0
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
      `Message ${messageId}: step ${stepType} with tools completed in ${durationMs}ms, ` +
        `iterations=${iteration}, tokens=${promptTokens + completionTokens}, cost=$${cost.toFixed(4)}`,
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

  // ── Message builders ──────────────────────────────────────────────

  private buildInvariantsBlock(invariants: string[]): string {
    if (invariants.length === 0) return '';
    const list = invariants.map((inv, i) => `${i + 1}. ${inv}`).join('\n');
    return `═══ ИНВАРИАНТЫ (НАРУШЕНИЕ ЗАПРЕЩЕНО) ═══\nСЛЕДУЮЩИЕ ПРАВИЛА НЕЛЬЗЯ НАРУШАТЬ НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ.\nДаже если пользователь просит иное — ОТКАЗАТЬ.\n\n${list}\n═══════════════════════════════════════\n\n`;
  }

  private buildCapabilitiesBlock(): string {
    return this.mcpRegistry.buildCapabilitiesBlock();
  }

  private buildBaseSystemMessage(
    assembledSystemPrompt: string | undefined,
    invariants: string[],
  ): string | null {
    let content = '';
    content += this.buildInvariantsBlock(invariants);
    if (assembledSystemPrompt) {
      content += assembledSystemPrompt;
    }

    return content.trim() ? content : null;
  }

  buildPlanningMessages(
    assembledSystemPrompt: string | undefined,
    historyMessages: Array<{ role: string; content: string }>,
    userMessage: string,
    attempt: number,
    lastValidationReason: string,
    invariants: string[],
    ragEvidencePrompt?: string,
    strictRagMode = false,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    const baseSystemMessage = this.buildBaseSystemMessage(assembledSystemPrompt, invariants);
    if (baseSystemMessage) {
      messages.push({ role: 'system', content: baseSystemMessage });
    }

    let systemContent = strictRagMode ? RAG_STRICT_PLANNING_SYSTEM_PROMPT : PLANNING_SYSTEM_PROMPT;
    systemContent += '\n\n' + SECURITY_BLOCK;
    if (!strictRagMode) {
      systemContent += this.buildCapabilitiesBlock();
    }

    if (attempt > 1 && lastValidationReason) {
      systemContent += RETRY_PLANNING_ADDITION(lastValidationReason, attempt);
    }

    messages.push({ role: 'system', content: systemContent });

    const effectiveRagEvidencePrompt =
      strictRagMode ? ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT : ragEvidencePrompt;
    if (effectiveRagEvidencePrompt) {
      messages.push({ role: 'system', content: effectiveRagEvidencePrompt });
    }

    for (const msg of historyMessages) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    return messages;
  }

  buildExecutionMessages(
    assembledSystemPrompt: string | undefined,
    planResult: string,
    userMessage: string,
    attempt: number,
    lastValidationReason: string,
    invariants: string[],
    ragEvidencePrompt?: string,
    strictRagMode = false,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    const baseSystemMessage = this.buildBaseSystemMessage(assembledSystemPrompt, invariants);
    if (baseSystemMessage) {
      messages.push({ role: 'system', content: baseSystemMessage });
    }

    let systemContent = strictRagMode ? RAG_STRICT_EXECUTION_SYSTEM_PROMPT : EXECUTION_SYSTEM_PROMPT;
    systemContent += '\n\n' + SECURITY_BLOCK;
    if (!strictRagMode) {
      systemContent += this.buildCapabilitiesBlock();
    }
    if (attempt > 1 && lastValidationReason) {
      systemContent += RETRY_EXECUTION_ADDITION(lastValidationReason, attempt);
    }
    systemContent += `\n\nПлан:\n${planResult}\n\nЗадача пользователя:\n${userMessage}`;

    messages.push({ role: 'system', content: systemContent });
    const effectiveRagEvidencePrompt =
      strictRagMode ? ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT : ragEvidencePrompt;
    if (effectiveRagEvidencePrompt) {
      messages.push({ role: 'system', content: effectiveRagEvidencePrompt });
    }

    return messages;
  }

  buildValidationMessages(
    assembledSystemPrompt: string | undefined,
    userMessage: string,
    planResult: string,
    execResult: string,
    invariants: string[],
    ragEvidencePrompt?: string,
    strictRagMode = false,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    const baseSystemMessage = this.buildBaseSystemMessage(assembledSystemPrompt, invariants);
    if (baseSystemMessage) {
      messages.push({ role: 'system', content: baseSystemMessage });
    }

    let content = strictRagMode ? RAG_STRICT_VALIDATION_SYSTEM_PROMPT : VALIDATION_SYSTEM_PROMPT;
    content += '\n\n' + VALIDATION_INJECTION_CHECK + '\n\n' + SECURITY_BLOCK;
    if (!strictRagMode) {
      content += this.buildCapabilitiesBlock();
    }
    content += `\n\nЗапрос пользователя:\n${userMessage}\n\nПлан:\n${planResult}\n\nРезультат выполнения:\n${execResult}`;

    if (invariants.length > 0) {
      content += '\n\nОБЯЗАТЕЛЬНО проверь соблюдение каждого инварианта:';
      invariants.forEach((inv, i) => {
        content += `\n${i + 1}. ${inv} — соблюдён? (да/нет, почему)`;
      });
      content += '\nЕсли хотя бы один инвариант нарушен — VERDICT: FAIL';
    }

    messages.push({ role: 'system', content });
    const effectiveRagEvidencePrompt =
      strictRagMode ? ragEvidencePrompt ?? EMPTY_RAG_EVIDENCE_SYSTEM_PROMPT : ragEvidencePrompt;
    if (effectiveRagEvidencePrompt) {
      messages.push({ role: 'system', content: effectiveRagEvidencePrompt });
    }

    return messages;
  }

  parseRagPlanningAssessment(text: string): RagPlanningAssessment {
    const safeText = text || '';
    const parsedJson = tryParseRagPlanningJson(safeText);
    if (parsedJson) {
      return parsedJson;
    }

    const rawVerdict = extractStrictPlanningField(safeText, 'RAG_VERDICT');
    const rawResponseMode = extractStrictPlanningField(safeText, 'RESPONSE_MODE');
    const rawChunksValue = extractStrictPlanningField(safeText, 'CHUNKS_USED');
    const missingInfo = extractStrictPlanningField(safeText, 'MISSING_INFO');
    const planText = extractStrictPlanningPlan(safeText);

    const verdict = rawVerdict.toUpperCase();
    const responseModeValue = rawResponseMode.toUpperCase();

    if (verdict !== 'SUFFICIENT' && verdict !== 'INSUFFICIENT') {
      throw new Error(`Planning output has invalid RAG_VERDICT: ${rawVerdict}`);
    }

    if (responseModeValue !== 'ANSWER' && responseModeValue !== 'REFUSE') {
      throw new Error(`Planning output has invalid RESPONSE_MODE: ${rawResponseMode}`);
    }

    const chunkIds =
      rawChunksValue.toUpperCase() === 'NONE'
        ? []
        : rawChunksValue
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    const ragVerdict = verdict as 'SUFFICIENT' | 'INSUFFICIENT';
    const responseMode = responseModeValue as 'ANSWER' | 'REFUSE';

    if (ragVerdict === 'SUFFICIENT' && responseMode !== 'ANSWER') {
      throw new Error('Planning output has inconsistent SUFFICIENT/REFUSE combination');
    }

    if (ragVerdict === 'INSUFFICIENT' && responseMode !== 'REFUSE') {
      throw new Error('Planning output has inconsistent INSUFFICIENT/ANSWER combination');
    }

    if (responseMode === 'ANSWER' && chunkIds.length === 0) {
      throw new Error('Planning output selected ANSWER without any chunk_id');
    }

    return {
      ragVerdict,
      responseMode,
      chunkIds,
      missingInfo,
      planText,
      source: 'model',
      repairReason: null,
      raw: safeText,
    };
  }

  serializeRagPlanningAssessment(assessment: RagPlanningAssessment): string {
    return JSON.stringify(
      {
        ragVerdict: assessment.ragVerdict,
        responseMode: assessment.responseMode,
        chunkIds: assessment.chunkIds,
        missingInfo: assessment.missingInfo,
        planSteps: assessment.planText
          .split('\n')
          .map((step) => step.trim())
          .filter(Boolean),
      },
      null,
      2,
    );
  }

  verifyRagExecutionOutput(
    execResult: string,
    planning: RagPlanningAssessment,
    ragResult: RagContextResult,
  ): { ok: boolean; reason?: string; audit: RagExecutionAudit } {
    const safeResult = execResult || '';
    const jsonExecution = tryParseRagExecutionJson(safeResult);
    if (jsonExecution) {
      return this.verifyStructuredRagExecution(jsonExecution, planning, ragResult, safeResult);
    }

    if (planning.responseMode === 'REFUSE') {
      const normalized = safeResult.toLowerCase();
      const refusalDetected =
        normalized.includes('недостаточно данных в rag') &&
        normalized.includes('ответы в этом режиме строятся только по данным из rag');
      const audit: RagExecutionAudit = {
        mode: 'REFUSE',
        summary: null,
        referencedChunkIds: [],
        quoteCount: 0,
        refusalReason: null,
        missingInfo: planning.missingInfo,
        references: [],
      };

      if (!refusalDetected) {
        return {
          ok: false,
          reason: 'Execution не вернул явный отказ по шаблону строгого RAG-режима',
          audit,
        };
      }

      if (/chunk_id:\s*/i.test(safeResult)) {
        return {
          ok: false,
          reason: 'Execution в режиме отказа не должен ссылаться на chunk_id как на полноценный ответ',
          audit,
        };
      }

      return { ok: true, audit };
    }

    const references = this.parseRagExecutionReferences(safeResult);
    const summary = this.parseRagExecutionSummary(safeResult);
    const audit: RagExecutionAudit = {
      mode: 'ANSWER',
      summary,
      referencedChunkIds: Array.from(new Set(references.map((reference) => reference.chunkId))),
      quoteCount: references.length,
      refusalReason: null,
      missingInfo: null,
      references,
    };

    if (!summary) {
      return {
        ok: false,
        reason: 'Execution не заполнил секцию "Краткий ответ" в строгом RAG-режиме',
        audit,
      };
    }

    if (references.length === 0) {
      return {
        ok: false,
        reason: 'Execution не указал ни одного chunk_id с цитатой',
        audit,
      };
    }

    const allowedChunkIds = new Set(planning.chunkIds);
    const matchesByChunkId = new Map(ragResult.matches.map((match) => [match.chunkId, match]));

    for (const reference of references) {
      if (!allowedChunkIds.has(reference.chunkId)) {
        return {
          ok: false,
          reason: `Execution использовал chunk_id вне CHUNKS_USED: ${reference.chunkId}`,
          audit,
        };
      }

      const match = matchesByChunkId.get(reference.chunkId);
      if (!match) {
        return {
          ok: false,
          reason: `Execution сослался на chunk_id, которого нет в текущем RAG-блоке: ${reference.chunkId}`,
          audit,
        };
      }

      if (!containsNormalizedQuote(match.content, reference.quote)) {
        return {
          ok: false,
          reason: `Цитата не найдена в content соответствующего чанка: ${reference.chunkId}; quote="${truncateStrictRagText(reference.quote, 160)}"`,
          audit,
        };
      }
    }

    return { ok: true, audit };
  }

  renderStrictRagResponse(
    planning: RagPlanningAssessment,
    audit: RagExecutionAudit,
    ragResult: RagContextResult,
  ): string {
    if (planning.responseMode === 'REFUSE' || audit.mode === 'REFUSE') {
      return [
        '## Статус',
        'Недостаточно данных в RAG',
        '',
        '## Почему не могу ответить',
        audit.refusalReason ||
          'В текущем наборе RAG-доказательств недостаточно подтверждённых данных для надёжного ответа.',
        '',
        '## Чего не хватает',
        audit.missingInfo || planning.missingInfo,
        '',
        '## Использованный режим',
        'Ответы в этом режиме строятся только по данным из RAG',
      ].join('\n');
    }

    const matchesByChunkId = new Map(ragResult.matches.map((match) => [match.chunkId, match]));
    const sections = [
      '## Краткий ответ',
      audit.summary ?? '',
      '',
      '## Источники и цитаты',
    ];

    audit.references.forEach((reference, index) => {
      const match = matchesByChunkId.get(reference.chunkId);
      if (!match) {
        throw new Error(
          `Невозможно собрать strict RAG-ответ: chunk_id не найден в текущем RAG-блоке: ${reference.chunkId}`,
        );
      }

      const source = String(match.document.metadata.channel_name ?? match.document.sourceKey);
      const publishedAt = match.document.publishedAt?.toISOString() ?? 'unknown';
      const sourceRef = buildRagSourceRef(match);

      sections.push(
        `${index + 1}. chunk_id: ${reference.chunkId}`,
        `   source_ref: ${sourceRef}`,
        `   source: ${source}`,
        `   message_id: ${match.document.externalId}`,
        `   published_at: ${publishedAt}`,
        `   Цитата: "${reference.quote}"`,
        `   Как это подтверждает ответ: ${reference.explanation}`,
      );
    });

    return sections.join('\n');
  }

  private parseRagExecutionReferences(text: string): RagExecutionReference[] {
    const matches = Array.from(
      text.matchAll(
        /(?:^|\n)(?:\d+\.\s*)?chunk_id:\s*([0-9a-f-]+)\s*\n\s*Цитата:\s*"([^"\n]+)"\s*\n\s*Как это подтверждает ответ:\s*([\s\S]*?)(?=(?:\n(?:\d+\.\s*)?chunk_id:)|$)/gim,
      ),
    );

    return matches.map((match) => ({
      chunkId: match[1].trim(),
      quote: match[2].trim(),
      explanation: match[3].trim(),
    }));
  }

  private parseRagExecutionSummary(text: string): string | null {
    const match = text.match(
      /##\s*Краткий ответ\s*\n([\s\S]*?)(?=\n##\s*(?:Подтверждение по чанкам|Источники и цитаты)\b|$)/i,
    );
    const summary = match?.[1]?.trim() ?? '';
    return summary || null;
  }

  // ── Validation parser ─────────────────────────────────────────────

  parseValidation(text: string): ValidationResult {
    const safeText = text || '';
    const verdictMatch = safeText.match(/VERDICT:\s*(PASS|FAIL|INJECTION)/i);
    const scoreMatch = safeText.match(/SCORE:\s*(\d+)/i);
    const reasonMatch = safeText.match(/REASON:\s*(.+)/i);

    const passed = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : false;
    const injection = verdictMatch ? verdictMatch[1].toUpperCase() === 'INJECTION' : false;
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const reason = reasonMatch ? reasonMatch[1].trim() : 'No reason provided';

    return { passed, score, reason, injection };
  }

  private verifyStructuredRagExecution(
    payload: ParsedRagExecutionPayload,
    planning: RagPlanningAssessment,
    ragResult: RagContextResult,
    rawResult: string,
  ): { ok: boolean; reason?: string; audit: RagExecutionAudit } {
    if (payload.mode === 'REFUSE') {
      const audit: RagExecutionAudit = {
        mode: 'REFUSE',
        summary: null,
        referencedChunkIds: [],
        quoteCount: 0,
        refusalReason: payload.reason,
        missingInfo: payload.missingInfo,
        references: [],
      };

      if (planning.responseMode !== 'REFUSE') {
        return {
          ok: false,
          reason: 'Execution вернул REFUSE, хотя план требовал ANSWER',
          audit,
        };
      }

      if (!payload.reason.trim()) {
        return {
          ok: false,
          reason: 'Execution вернул пустое поле reason в REFUSE-ответе',
          audit,
        };
      }

      if (!payload.missingInfo.trim()) {
        return {
          ok: false,
          reason: 'Execution вернул пустое поле missingInfo в REFUSE-ответе',
          audit,
        };
      }

      return { ok: true, audit };
    }

    const references = payload.references;
    const audit: RagExecutionAudit = {
      mode: 'ANSWER',
      summary: payload.summary,
      referencedChunkIds: Array.from(new Set(references.map((reference) => reference.chunkId))),
      quoteCount: references.length,
      refusalReason: null,
      missingInfo: null,
      references,
    };

    if (planning.responseMode !== 'ANSWER') {
      return {
        ok: false,
        reason: 'Execution вернул ANSWER, хотя план требовал REFUSE',
        audit,
      };
    }

    if (!payload.summary.trim()) {
      return {
        ok: false,
        reason: 'Execution не заполнил summary в структурированном strict RAG-ответе',
        audit,
      };
    }

    if (references.length === 0) {
      return {
        ok: false,
        reason: 'Execution не указал ни одной ссылки на chunk_id в структурированном strict RAG-ответе',
        audit,
      };
    }

    const allowedChunkIds = new Set(planning.chunkIds);
    const matchesByChunkId = new Map(ragResult.matches.map((match) => [match.chunkId, match]));

    for (const reference of references) {
      if (!allowedChunkIds.has(reference.chunkId)) {
        return {
          ok: false,
          reason: `Execution использовал chunk_id вне CHUNKS_USED: ${reference.chunkId}`,
          audit,
        };
      }

      const match = matchesByChunkId.get(reference.chunkId);
      if (!match) {
        return {
          ok: false,
          reason: `Execution сослался на chunk_id, которого нет в текущем RAG-блоке: ${reference.chunkId}`,
          audit,
        };
      }

      if (!containsNormalizedQuote(match.content, reference.quote)) {
        return {
          ok: false,
          reason: `Цитата не найдена в content соответствующего чанка: ${reference.chunkId}; quote="${truncateStrictRagText(reference.quote, 160)}"`,
          audit,
        };
      }

      if (!reference.explanation.trim()) {
        return {
          ok: false,
          reason: `Execution вернул пустое explanation для chunk_id: ${reference.chunkId}`,
          audit,
        };
      }
    }

    if (rawResult.includes('## ') || rawResult.includes('chunk_id:')) {
      return {
        ok: false,
        reason: 'Execution в strict RAG должен возвращать только структурированный JSON без markdown',
        audit,
      };
    }

    return { ok: true, audit };
  }
}

interface ParsedRagExecutionAnswerPayload {
  mode: 'ANSWER';
  summary: string;
  references: RagExecutionReference[];
}

interface ParsedRagExecutionRefusePayload {
  mode: 'REFUSE';
  reason: string;
  missingInfo: string;
}

type ParsedRagExecutionPayload = ParsedRagExecutionAnswerPayload | ParsedRagExecutionRefusePayload;

function containsNormalizedQuote(content: string, quote: string): boolean {
  const normalizedContent = normalizeComparisonText(content);
  const normalizedQuote = normalizeComparisonText(quote);

  return normalizedQuote.length > 0 && normalizedContent.includes(normalizedQuote);
}

function tryParseRagPlanningJson(text: string): RagPlanningAssessment | null {
  const parsed = tryParseJsonObject(text);
  if (!parsed) {
    return null;
  }

  const ragVerdict = readEnumField(parsed, 'ragVerdict', ['SUFFICIENT', 'INSUFFICIENT']);
  const responseMode = readEnumField(parsed, 'responseMode', ['ANSWER', 'REFUSE']);
  const chunkIds = readStringArrayField(parsed, 'chunkIds');
  const missingInfo = readStringField(parsed, 'missingInfo');
  const planSteps = readStringArrayField(parsed, 'planSteps');

  if (ragVerdict === 'SUFFICIENT' && responseMode !== 'ANSWER') {
    throw new Error('Planning output has inconsistent SUFFICIENT/REFUSE combination');
  }

  if (ragVerdict === 'INSUFFICIENT' && responseMode !== 'REFUSE') {
    throw new Error('Planning output has inconsistent INSUFFICIENT/ANSWER combination');
  }

  if (responseMode === 'ANSWER' && chunkIds.length === 0) {
    throw new Error('Planning output selected ANSWER without any chunk_id');
  }

  if (responseMode === 'REFUSE' && chunkIds.length > 0) {
    throw new Error('Planning output selected REFUSE with non-empty chunkIds');
  }

  if (planSteps.length === 0) {
    throw new Error('Planning output does not contain non-empty planSteps');
  }

  return {
    ragVerdict,
    responseMode,
    chunkIds,
    missingInfo,
    planText: planSteps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    source: 'model',
    repairReason: null,
    raw: text,
  };
}

function tryParseRagExecutionJson(text: string): ParsedRagExecutionPayload | null {
  const parsed = tryParseJsonObject(text);
  if (!parsed) {
    return null;
  }

  const mode = readEnumField(parsed, 'mode', ['ANSWER', 'REFUSE']);
  if (mode === 'REFUSE') {
    return {
      mode,
      reason: readStringField(parsed, 'reason'),
      missingInfo: readStringField(parsed, 'missingInfo'),
    };
  }

  const summary = readStringField(parsed, 'summary');
  const rawReferences = parsed.references;
  if (!Array.isArray(rawReferences) || rawReferences.length === 0) {
    throw new Error('Execution output does not contain non-empty references array');
  }

  const references = rawReferences.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Execution reference at index ${index} has invalid shape`);
    }

    const record = value as Record<string, unknown>;
    return {
      chunkId: readStringField(record, 'chunkId'),
      quote: readStringField(record, 'quote'),
      explanation: readStringField(record, 'explanation'),
    };
  });

  return {
    mode,
    summary,
    references,
  };
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = unwrapJsonCodeFence(text.trim());
  if (!normalized.startsWith('{')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw new Error(
      `Structured strict RAG payload contains invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Structured strict RAG payload must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function unwrapJsonCodeFence(value: string): string {
  if (!value.startsWith('```')) {
    return value;
  }

  return value.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
}

function readStringField(record: Record<string, unknown>, fieldName: string): string {
  const value = record[fieldName];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Structured strict RAG payload has invalid field "${fieldName}"`);
  }

  return value.trim();
}

function readStringArrayField(record: Record<string, unknown>, fieldName: string): string[] {
  const value = record[fieldName];
  if (!Array.isArray(value)) {
    throw new Error(`Structured strict RAG payload has invalid field "${fieldName}"`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(
        `Structured strict RAG payload has invalid string element in "${fieldName}" at index ${index}`,
      );
    }
    return item.trim();
  });
}

function readEnumField<const T extends readonly string[]>(
  record: Record<string, unknown>,
  fieldName: string,
  allowedValues: T,
): T[number] {
  const rawValue = readStringField(record, fieldName).toUpperCase();
  if (!(allowedValues as readonly string[]).includes(rawValue)) {
    throw new Error(
      `Structured strict RAG payload has invalid field "${fieldName}": ${rawValue}`,
    );
  }

  return rawValue as T[number];
}

function normalizeComparisonText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[«»“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateStrictRagText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function extractStrictPlanningField(text: string, fieldName: string): string {
  const regex = new RegExp(`^${fieldName}:\\s*(.*)$`, 'gim');
  const matches = Array.from(text.matchAll(regex));

  if (matches.length === 0) {
    throw new Error(`Planning output does not contain ${fieldName}`);
  }

  if (matches.length > 1) {
    throw new Error(`Planning output contains duplicate ${fieldName}`);
  }

  const value = matches[0][1]?.trim() ?? '';
  if (!value) {
    throw new Error(`Planning output contains empty ${fieldName}`);
  }

  return value;
}

function extractStrictPlanningPlan(text: string): string {
  const regex = /^PLAN:\s*(.*)$/gim;
  const matches = Array.from(text.matchAll(regex));

  if (matches.length === 0) {
    throw new Error('Planning output does not contain PLAN');
  }

  if (matches.length > 1) {
    throw new Error('Planning output contains duplicate PLAN');
  }

  const match = matches[0];
  const sameLinePlan = match[1]?.trim() ?? '';
  const suffixStart = (match.index ?? 0) + match[0].length;
  const remainingPlan = text.slice(suffixStart).trim();
  const planText = [sameLinePlan, remainingPlan].filter(Boolean).join('\n').trim();

  if (!planText) {
    throw new Error('Planning output does not contain a non-empty PLAN section');
  }

  return planText;
}

function buildRagSourceRef(match: RagContextResult['matches'][number]): string {
  return `${match.document.sourceType}:${match.document.sourceKey}/message:${match.document.externalId}#chunk:${match.chunkIndex}`;
}
