import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { OpenAIService } from './openai.service';
import { ConversationService } from '../../conversation/conversation.service';
import { TokenService } from './token.service';
import { ContextStrategyService } from './context-strategy.service';
import { MemoryAssemblerService } from './memory-assembler.service';
import { PipelineMessageDto } from '../dto/pipeline.dto';
import { ALLOWED_MODELS, DEFAULT_MODEL } from '../dto/ai-params.dto';

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
VERDICT: PASS или VERDICT: FAIL
SCORE: число от 1 до 10
REASON: краткое объяснение вердикта
ISSUES: список проблем (если FAIL)

Будь строгим, но справедливым. Не пропускай ответы с явными недостатками.`;

const RETRY_PLANNING_ADDITION = (reason: string, attempt: number): string =>
  `\n\n⚠️ ВНИМАНИЕ: Это повторная попытка #${attempt}. Предыдущая версия не прошла валидацию.
Причина отказа: ${reason}
Учти эту обратную связь и улучши план.`;

// ── Types ─────────────────────────────────────────────────────────────

type StepType = 'planning' | 'execution' | 'validation';
type PipelineStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface ValidationResult {
  passed: boolean;
  score: number;
  reason: string;
}

interface PipelineRun {
  id: string;
  conversation_id: string;
  user_message_id: string | null;
  status: PipelineStatus;
  current_step: string;
  attempt_number: number;
  max_attempts: number;
  paused_at_step: string | null;
  error_message: string | null;
  total_cost: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

interface PipelineStep {
  id: string;
  pipeline_run_id: string;
  step_type: StepType;
  attempt_number: number;
  status: string;
  input_context: unknown;
  output_result: unknown;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  duration_ms: number;
  validation_passed: boolean | null;
  validation_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

// ── Service ───────────────────────────────────────────────────────────

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly openaiService: OpenAIService,
    private readonly conversationService: ConversationService,
    private readonly tokenService: TokenService,
    private readonly contextStrategyService: ContextStrategyService,
    private readonly memoryAssemblerService: MemoryAssemblerService,
  ) {}

  // ── Public: run pipeline ──────────────────────────────────────────

  async runPipeline(
    dto: PipelineMessageDto,
    username: string,
    onEvent: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const params = dto.params;
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');

    const planningModel = 'gpt-4.1-nano';
    const validationModel = 'gpt-4.1-nano';
    const userModel =
      params?.model && ALLOWED_MODELS.includes(params.model as (typeof ALLOWED_MODELS)[number])
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

    // Save user message
    const userMsg = await this.conversationService.addMessage(
      dto.conversationId,
      'user',
      dto.message,
      {
        tokenCount: this.tokenService.countTokens(dto.message, userModel),
      },
    );

    // Create pipeline_run
    const pipelineId = crypto.randomUUID();
    const maxAttempts = 3;
    await this.db.query(
      `INSERT INTO pipeline_runs (id, conversation_id, user_message_id, status, current_step, attempt_number, max_attempts)
       VALUES ($1, $2, $3, 'running', 'planning', 1, $4)`,
      [pipelineId, dto.conversationId, userMsg.id, maxAttempts],
    );

    onEvent({ type: 'pipeline_started', pipelineId });
    this.logger.log(`Pipeline started: id=${pipelineId} conv=${dto.conversationId} model=${userModel}`);

    // Assemble memory context
    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      username,
      conversationId: dto.conversationId,
      userSystemPrompt: params?.systemPrompt?.trim()?.slice(0, 4000) || undefined,
      model: userModel,
    });
    const assembledSystemPrompt = memoryResult.systemPrompt || undefined;

    // Get conversation history for context
    const historyMessages = await this.conversationService.getMessagesForContext(dto.conversationId);

    let attempt = 1;
    let lastValidationReason = '';

    try {
      while (attempt <= maxAttempts) {
        this.logger.log(`Pipeline ${pipelineId}: attempt ${attempt}/${maxAttempts}`);

        await this.db.query(
          `UPDATE pipeline_runs SET attempt_number = $1, updated_at = NOW() WHERE id = $2`,
          [attempt, pipelineId],
        );

        // Check pause
        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'planning' });
          this.logger.log(`Pipeline ${pipelineId}: paused before planning`);
          break;
        }

        // ── PLANNING ──
        const planningMessages = this.buildPlanningMessages(
          assembledSystemPrompt,
          historyMessages,
          dto.message,
          attempt,
          lastValidationReason,
        );

        const planResult = await this.runStep(
          pipelineId, 'planning', planningModel, planningMessages,
          temperature, maxTokens, attempt, onEvent,
        );

        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'execution' });
          this.logger.log(`Pipeline ${pipelineId}: paused after planning`);
          break;
        }

        // ── EXECUTION ──
        const executionMessages = this.buildExecutionMessages(
          assembledSystemPrompt,
          planResult,
          dto.message,
        );

        const execResult = await this.runStep(
          pipelineId, 'execution', userModel, executionMessages,
          temperature, maxTokens, attempt, onEvent,
        );

        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'validation' });
          this.logger.log(`Pipeline ${pipelineId}: paused after execution`);
          break;
        }

        // ── VALIDATION ──
        const validationMessages = this.buildValidationMessages(
          planResult,
          execResult,
        );

        const validResult = await this.runStep(
          pipelineId, 'validation', validationModel, validationMessages,
          temperature, maxTokens, attempt, onEvent,
        );

        const validation = this.parseValidation(validResult);

        // Update validation on the step
        await this.db.query(
          `UPDATE pipeline_steps
           SET validation_passed = $1, validation_reason = $2
           WHERE pipeline_run_id = $3 AND step_type = 'validation' AND attempt_number = $4`,
          [validation.passed, validation.reason, pipelineId, attempt],
        );

        if (validation.passed) {
          // Save assistant message to conversation
          const assistantMsg = await this.conversationService.addMessage(
            dto.conversationId,
            'assistant',
            execResult,
            { model: userModel },
          );

          // Save pipeline debug data for the assistant message
          if (assistantMsg?.id) {
            await this.savePipelineDebugData(pipelineId, assistantMsg.id, attempt);
          }

          await this.db.query(
            `UPDATE pipeline_runs SET status = 'completed', current_step = 'done', updated_at = NOW() WHERE id = $1`,
            [pipelineId],
          );

          const { rows: totalsRows } = await this.db.query(
            'SELECT total_cost, total_tokens FROM pipeline_runs WHERE id = $1',
            [pipelineId],
          );
          const totals = totalsRows[0];

          onEvent({
            type: 'done',
            content: execResult,
            pipelineId,
            attempt,
            totalCost: totals.total_cost,
            totalTokens: totals.total_tokens,
            assistantMessageId: assistantMsg?.id,
          });

          this.logger.log(`Pipeline ${pipelineId}: completed on attempt ${attempt}, score=${validation.score}`);
          return;
        }

        // Validation failed
        lastValidationReason = validation.reason;
        onEvent({
          type: 'validation_failed',
          reason: validation.reason,
          score: validation.score,
          attempt,
          maxAttempts,
        });

        this.logger.warn(`Pipeline ${pipelineId}: validation failed attempt ${attempt}, reason: ${validation.reason}`);
        attempt++;
      }

      // Exhausted attempts or paused
      const finalStatus = await this.getStatus(pipelineId);
      if (finalStatus !== 'paused' && finalStatus !== 'completed') {
        await this.db.query(
          `UPDATE pipeline_runs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
          ['Exhausted all retry attempts', pipelineId],
        );
        onEvent({ type: 'error', message: 'Exhausted all retry attempts' });
        this.logger.warn(`Pipeline ${pipelineId}: failed after ${attempt - 1} attempts`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Pipeline ${pipelineId} error: ${message}`);

      await this.db.query(
        `UPDATE pipeline_runs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [message, pipelineId],
      );

      onEvent({ type: 'error', message });
    }
  }

  // ── Public: pause / resume / cancel / get ─────────────────────────

  async pausePipeline(pipelineId: string): Promise<void> {
    await this.db.query(
      `UPDATE pipeline_runs
       SET status = 'paused', paused_at_step = current_step, updated_at = NOW()
       WHERE id = $1`,
      [pipelineId],
    );
    this.logger.log(`Pipeline ${pipelineId}: paused`);
  }

  async resumePipeline(
    pipelineId: string,
    onEvent: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const run = await this.loadPipelineRun(pipelineId);
    if (!run) {
      throw new Error('Pipeline run not found');
    }
    if (run.status !== 'paused') {
      throw new Error(`Cannot resume pipeline with status: ${run.status}`);
    }

    // Load completed steps for this attempt
    const { rows: completedSteps } = await this.db.query<PipelineStep>(
      `SELECT * FROM pipeline_steps
       WHERE pipeline_run_id = $1 AND attempt_number = $2 AND status = 'completed'
       ORDER BY created_at ASC`,
      [pipelineId, run.attempt_number],
    );

    await this.db.query(
      `UPDATE pipeline_runs SET status = 'running', paused_at_step = NULL, updated_at = NOW() WHERE id = $1`,
      [pipelineId],
    );

    onEvent({ type: 'pipeline_resumed', pipelineId, fromStep: run.paused_at_step });
    this.logger.log(`Pipeline ${pipelineId}: resumed from ${run.paused_at_step}`);

    // Determine which steps are already done
    const completedTypes = new Set(completedSteps.map((s) => s.step_type));
    const planStep = completedSteps.find((s) => s.step_type === 'planning');
    const execStep = completedSteps.find((s) => s.step_type === 'execution');

    const planResult = planStep?.output_result
      ? (typeof planStep.output_result === 'string'
          ? planStep.output_result
          : (planStep.output_result as { text?: string })?.text || '')
      : '';
    const execResult = execStep?.output_result
      ? (typeof execStep.output_result === 'string'
          ? execStep.output_result
          : (execStep.output_result as { text?: string })?.text || '')
      : '';

    // Reload context
    const conversation = await this.conversationService.getConversation(run.conversation_id);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');
    const params = {} as PipelineMessageDto['params']; // resume uses defaults
    const planningModel = 'gpt-4.1-nano';
    const validationModel = 'gpt-4.1-nano';
    const userModel = conversation.model || DEFAULT_MODEL;
    const temperature = 1.0;
    const maxTokens = envMaxTokens;

    // Get user message content
    let userMessage = '';
    if (run.user_message_id) {
      const { rows } = await this.db.query(
        `SELECT content FROM messages WHERE id = $1`,
        [run.user_message_id],
      );
      if (rows.length > 0) {
        userMessage = rows[0].content;
      }
    }

    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      username: conversation.username,
      conversationId: run.conversation_id,
      model: userModel,
    });
    const assembledSystemPrompt = memoryResult.systemPrompt || undefined;
    const historyMessages = await this.conversationService.getMessagesForContext(run.conversation_id);

    let attempt = run.attempt_number;
    const maxAttempts = run.max_attempts;
    let lastValidationReason = '';
    let currentPlanResult = planResult;
    let currentExecResult = execResult;

    try {
      while (attempt <= maxAttempts) {
        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'planning' });
          break;
        }

        // Planning (if not completed in this attempt)
        if (!completedTypes.has('planning') || attempt > run.attempt_number) {
          const planningMessages = this.buildPlanningMessages(
            assembledSystemPrompt, historyMessages, userMessage, attempt, lastValidationReason,
          );
          currentPlanResult = await this.runStep(
            pipelineId, 'planning', planningModel, planningMessages,
            temperature, maxTokens, attempt, onEvent,
          );
        }

        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'execution' });
          break;
        }

        // Execution (if not completed in this attempt)
        if (!completedTypes.has('execution') || attempt > run.attempt_number) {
          const executionMessages = this.buildExecutionMessages(
            assembledSystemPrompt, currentPlanResult, userMessage,
          );
          currentExecResult = await this.runStep(
            pipelineId, 'execution', userModel, executionMessages,
            temperature, maxTokens, attempt, onEvent,
          );
        }

        if (await this.isPaused(pipelineId)) {
          onEvent({ type: 'paused', step: 'validation' });
          break;
        }

        // Validation (if not completed in this attempt)
        if (!completedTypes.has('validation') || attempt > run.attempt_number) {
          const validationMessages = this.buildValidationMessages(currentPlanResult, currentExecResult);
          const validResult = await this.runStep(
            pipelineId, 'validation', validationModel, validationMessages,
            temperature, maxTokens, attempt, onEvent,
          );
          const validation = this.parseValidation(validResult);

          await this.db.query(
            `UPDATE pipeline_steps
             SET validation_passed = $1, validation_reason = $2
             WHERE pipeline_run_id = $3 AND step_type = 'validation' AND attempt_number = $4`,
            [validation.passed, validation.reason, pipelineId, attempt],
          );

          if (validation.passed) {
            const assistantMsg = await this.conversationService.addMessage(
              run.conversation_id, 'assistant', currentExecResult, { model: userModel },
            );

            // Save pipeline debug data for the assistant message
            if (assistantMsg?.id) {
              await this.savePipelineDebugData(pipelineId, assistantMsg.id, attempt);
            }

            await this.db.query(
              `UPDATE pipeline_runs SET status = 'completed', current_step = 'done', updated_at = NOW() WHERE id = $1`,
              [pipelineId],
            );

            const { rows: totalsRows } = await this.db.query(
              'SELECT total_cost, total_tokens FROM pipeline_runs WHERE id = $1',
              [pipelineId],
            );
            const totals = totalsRows[0];

            onEvent({
              type: 'done',
              content: currentExecResult,
              pipelineId,
              attempt,
              totalCost: totals.total_cost,
              totalTokens: totals.total_tokens,
              assistantMessageId: assistantMsg?.id,
            });
            return;
          }

          lastValidationReason = validation.reason;
          onEvent({ type: 'validation_failed', reason: validation.reason, score: validation.score, attempt, maxAttempts });
        }

        // After first resumed iteration, clear the completed set so next attempt runs fresh
        completedTypes.clear();
        attempt++;

        await this.db.query(
          `UPDATE pipeline_runs SET attempt_number = $1, updated_at = NOW() WHERE id = $2`,
          [attempt, pipelineId],
        );
      }

      const finalStatus = await this.getStatus(pipelineId);
      if (finalStatus !== 'paused' && finalStatus !== 'completed') {
        await this.db.query(
          `UPDATE pipeline_runs SET status = 'failed', error_message = 'Exhausted all retry attempts', updated_at = NOW() WHERE id = $1`,
          [pipelineId],
        );
        onEvent({ type: 'error', message: 'Exhausted all retry attempts' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Pipeline resume ${pipelineId} error: ${message}`);
      await this.db.query(
        `UPDATE pipeline_runs SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [message, pipelineId],
      );
      onEvent({ type: 'error', message });
    }
  }

  async cancelPipeline(pipelineId: string): Promise<void> {
    await this.db.query(
      `UPDATE pipeline_runs SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [pipelineId],
    );
    this.logger.log(`Pipeline ${pipelineId}: cancelled`);
  }

  async getPipelineRun(pipelineId: string): Promise<Record<string, unknown> | null> {
    const { rows: runRows } = await this.db.query<PipelineRun>(
      `SELECT * FROM pipeline_runs WHERE id = $1`,
      [pipelineId],
    );
    if (runRows.length === 0) return null;

    const run = runRows[0];
    const { rows: steps } = await this.db.query<PipelineStep>(
      `SELECT * FROM pipeline_steps WHERE pipeline_run_id = $1 ORDER BY created_at ASC`,
      [pipelineId],
    );

    return {
      id: run.id,
      conversationId: run.conversation_id,
      userMessageId: run.user_message_id,
      status: run.status,
      currentStep: run.current_step,
      attemptNumber: run.attempt_number,
      maxAttempts: run.max_attempts,
      pausedAtStep: run.paused_at_step,
      errorMessage: run.error_message,
      totalCost: run.total_cost,
      totalTokens: run.total_tokens,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      steps: steps.map((s) => ({
        id: s.id,
        stepType: s.step_type,
        attemptNumber: s.attempt_number,
        status: s.status,
        model: s.model,
        promptTokens: s.prompt_tokens,
        completionTokens: s.completion_tokens,
        cost: s.cost,
        durationMs: s.duration_ms,
        validationPassed: s.validation_passed,
        validationReason: s.validation_reason,
        outputResult: s.output_result,
        createdAt: s.created_at,
        completedAt: s.completed_at,
      })),
    };
  }

  async getActivePipelineByConversation(conversationId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query<PipelineRun>(
      `SELECT * FROM pipeline_runs
       WHERE conversation_id = $1 AND status IN ('running', 'paused')
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    if (rows.length === 0) return null;
    return this.getPipelineRun(rows[0].id);
  }

  // ── Private: run a single step with streaming ─────────────────────

  private async runStep(
    pipelineId: string,
    stepType: StepType,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    maxTokens: number,
    attempt: number,
    onEvent: (event: Record<string, unknown>) => void,
  ): Promise<string> {
    const stepId = crypto.randomUUID();
    const startTime = Date.now();

    // Insert step with input context
    const inputContext = messages.map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    await this.db.query(
      `INSERT INTO pipeline_steps (id, pipeline_run_id, step_type, attempt_number, status, model, input_context)
       VALUES ($1, $2, $3, $4, 'running', $5, $6)`,
      [stepId, pipelineId, stepType, attempt, model, JSON.stringify(inputContext)],
    );

    // Update current_step on run
    await this.db.query(
      `UPDATE pipeline_runs SET current_step = $1, updated_at = NOW() WHERE id = $2`,
      [stepType, pipelineId],
    );

    onEvent({ type: 'step_start', step: stepType, attempt, model });
    this.logger.debug(`Pipeline ${pipelineId}: step ${stepType} started (attempt ${attempt}, model ${model})`);

    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    try {
      const stream = this.openaiService.callOpenAIStream(model, messages, temperature, maxTokens);

      for await (const chunk of stream) {
        if (chunk.type === 'delta' && chunk.content) {
          fullText += chunk.content;
          onEvent({ type: 'step_delta', step: stepType, content: chunk.content });
        }
        if (chunk.type === 'done' && chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Pipeline ${pipelineId}: step ${stepType} failed: ${message}`);

      await this.db.query(
        `UPDATE pipeline_steps SET status = 'failed', completed_at = NOW() WHERE id = $1`,
        [stepId],
      );

      throw err;
    }

    const durationMs = Date.now() - startTime;
    const cost = this.openaiService.calculateCost(model, promptTokens, completionTokens);

    // Update step as completed
    await this.db.query(
      `UPDATE pipeline_steps
       SET status = 'completed',
           output_result = $1,
           prompt_tokens = $2,
           completion_tokens = $3,
           cost = $4,
           duration_ms = $5,
           completed_at = NOW()
       WHERE id = $6`,
      [JSON.stringify({ text: fullText }), promptTokens, completionTokens, cost, durationMs, stepId],
    );

    // Update pipeline run totals
    await this.db.query(
      `UPDATE pipeline_runs
       SET total_cost = total_cost + $1,
           total_tokens = total_tokens + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [cost, totalTokens, pipelineId],
    );

    onEvent({
      type: 'step_complete',
      step: stepType,
      content: fullText,
      cost,
      tokens: totalTokens,
      durationMs,
    });

    this.logger.debug(
      `Pipeline ${pipelineId}: step ${stepType} completed in ${durationMs}ms, tokens=${totalTokens}, cost=$${cost.toFixed(4)}`,
    );

    return fullText;
  }

  // ── Private: save pipeline debug data ──────────────────────────────

  private async savePipelineDebugData(
    pipelineId: string,
    messageId: string,
    attempt: number,
  ): Promise<void> {
    try {
      // Load all pipeline steps
      const { rows: steps } = await this.db.query<PipelineStep>(
        `SELECT * FROM pipeline_steps WHERE pipeline_run_id = $1 ORDER BY created_at ASC`,
        [pipelineId],
      );

      // Load pipeline run for totals
      const { rows: runRows } = await this.db.query<PipelineRun>(
        `SELECT * FROM pipeline_runs WHERE id = $1`,
        [pipelineId],
      );
      const run = runRows[0];

      const pipelineDebugData = {
        pipelineId,
        totalAttempts: attempt,
        totalCost: run?.total_cost || 0,
        totalTokens: run?.total_tokens || 0,
        steps: steps.map((s) => ({
          stepType: s.step_type,
          attempt: s.attempt_number,
          status: s.status,
          model: s.model,
          promptTokens: s.prompt_tokens,
          completionTokens: s.completion_tokens,
          cost: s.cost,
          durationMs: s.duration_ms,
          validationPassed: s.validation_passed,
          validationReason: s.validation_reason,
          content:
            typeof s.output_result === 'string'
              ? s.output_result
              : (s.output_result as { text?: string })?.text || '',
          inputContext: s.input_context || [],
        })),
      };

      await this.conversationService.saveDebugData(messageId, {
        strategyType: 'pipeline',
        contextMessagesCount: 0,
        contextMessagesAfterTruncation: 0,
        pipelineData: pipelineDebugData,
      });

      this.logger.debug(`Pipeline ${pipelineId}: debug data saved for message ${messageId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Pipeline ${pipelineId}: failed to save debug data: ${message}`);
    }
  }

  // ── Private: message builders ─────────────────────────────────────

  private buildPlanningMessages(
    assembledSystemPrompt: string | undefined,
    historyMessages: Array<{ role: string; content: string }>,
    userMessage: string,
    attempt: number,
    lastValidationReason: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    let systemContent = '';
    if (assembledSystemPrompt) {
      systemContent += assembledSystemPrompt + '\n\n';
    }
    systemContent += PLANNING_SYSTEM_PROMPT;

    if (attempt > 1 && lastValidationReason) {
      systemContent += RETRY_PLANNING_ADDITION(lastValidationReason, attempt);
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
    ];

    // Add history (excluding last user message which we'll add explicitly)
    for (const msg of historyMessages) {
      // Skip the last entry if it's the same user message we're about to add
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    return messages;
  }

  private buildExecutionMessages(
    assembledSystemPrompt: string | undefined,
    planResult: string,
    userMessage: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    let systemContent = '';
    if (assembledSystemPrompt) {
      systemContent += assembledSystemPrompt + '\n\n';
    }
    systemContent += EXECUTION_SYSTEM_PROMPT;
    systemContent += `\n\nПлан:\n${planResult}\n\nЗадача пользователя:\n${userMessage}`;

    return [{ role: 'system', content: systemContent }];
  }

  private buildValidationMessages(
    planResult: string,
    execResult: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    let content = VALIDATION_SYSTEM_PROMPT;
    content += `\n\nПлан:\n${planResult}\n\nРезультат выполнения:\n${execResult}`;

    return [{ role: 'system', content }];
  }

  // ── Private: parse validation output ──────────────────────────────

  private parseValidation(text: string): ValidationResult {
    const verdictMatch = text.match(/VERDICT:\s*(PASS|FAIL)/i);
    const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
    const reasonMatch = text.match(/REASON:\s*(.+)/i);

    const passed = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : false;
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const reason = reasonMatch ? reasonMatch[1].trim() : 'No reason provided';

    return { passed, score, reason };
  }

  // ── Private: status helpers ───────────────────────────────────────

  private async isPaused(pipelineId: string): Promise<boolean> {
    const status = await this.getStatus(pipelineId);
    return status === 'paused';
  }

  private async getStatus(pipelineId: string): Promise<PipelineStatus | null> {
    const { rows } = await this.db.query<{ status: PipelineStatus }>(
      `SELECT status FROM pipeline_runs WHERE id = $1`,
      [pipelineId],
    );
    return rows.length > 0 ? rows[0].status : null;
  }

  private async loadPipelineRun(pipelineId: string): Promise<PipelineRun | null> {
    const { rows } = await this.db.query<PipelineRun>(
      `SELECT * FROM pipeline_runs WHERE id = $1`,
      [pipelineId],
    );
    return rows.length > 0 ? rows[0] : null;
  }
}
