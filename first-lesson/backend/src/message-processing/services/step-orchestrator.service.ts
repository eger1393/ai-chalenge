import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MessageRepository } from '../../conversation/repositories/message.repository';
import { ConversationService } from '../../conversation/conversation.service';
import { ContextService } from '../../context/context.service';
import { MemoryAssemblerService } from '../../memory/memory-assembler.service';
import { ProjectService } from '../../project/project.service';
import { TokenService } from '../../ai/token.service';
import { StepRunnerService, ValidationResult } from './step-runner.service';
import { GuardService } from './guard.service';
import { StepRepository } from '../repositories/step.repository';
import { ALLOWED_MODELS, DEFAULT_MODEL } from '../../ai/dto/ai-params.dto';

// ── Types ─────────────────────────────────────────────────────────────

export interface ProcessMessageParams {
  messageId: string;
  conversationId: string;
  userId: string;
  projectId?: string;
  onEvent: (event: Record<string, unknown>) => void;
}

// ── Service ───────────────────────────────────────────────────────────

@Injectable()
export class StepOrchestratorService {
  private readonly logger = new Logger(StepOrchestratorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationService: ConversationService,
    private readonly contextService: ContextService,
    private readonly memoryAssemblerService: MemoryAssemblerService,
    private readonly projectService: ProjectService,
    private readonly stepRunnerService: StepRunnerService,
    private readonly guardService: GuardService,
    private readonly tokenService: TokenService,
    private readonly stepRepository: StepRepository,
  ) {}

  // ── Public: process a message through the pipeline ────────────────

  async processMessage(params: ProcessMessageParams): Promise<void> {
    const { messageId, conversationId, userId, projectId, onEvent } = params;

    // 1. Update status to processing
    await this.messageRepository.updateStatus(messageId, 'processing');

    // 2. Load conversation settings
    const conversation = await this.conversationService.findOne(userId, conversationId);
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');

    const userModel =
      conversation.model && ALLOWED_MODELS.includes(conversation.model as (typeof ALLOWED_MODELS)[number])
        ? conversation.model
        : DEFAULT_MODEL;
    const temperature = conversation.temperature ?? 1.0;
    const maxTokens = conversation.maxTokens ?? envMaxTokens;
    const planningModel = 'gpt-4.1-nano';
    const validationModel = 'gpt-4.1-nano';

    // Load the message
    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      onEvent({ type: 'error', error: 'Message not found' });
      return;
    }
    const userContent = message.userContent;

    // 3. Guard check
    const guardCheck = this.guardService.checkMessage(userContent);
    if (guardCheck.blocked) {
      const blockMsg = 'Ваше сообщение содержит инструкции, которые нарушают порядок работы pipeline';
      await this.messageRepository.updateAssistantContent(messageId, blockMsg);
      await this.messageRepository.updateStatus(messageId, 'done');
      onEvent({ type: 'done', messageId, response: blockMsg, meta: {} });
      this.logger.warn(
        `Injection detected in message ${messageId}, pattern=${guardCheck.matchedPattern}`,
      );
      return;
    }

    // 4. Assemble memory
    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      userId,
      projectId,
      userSystemPrompt: conversation.systemPrompt?.trim()?.slice(0, 4000) || undefined,
      model: userModel,
    });
    const assembledSystemPrompt = memoryResult.systemPrompt || undefined;

    // 5. Load invariants
    let invariants: string[] = [];
    if (projectId) {
      const rawInvariants = await this.projectService.getInvariantsByProjectId(projectId);
      invariants = this.guardService.filterInvariants(rawInvariants, projectId);
    }

    // 6. Prepare context
    const systemMessages: Array<{ role: string; content: string }> = [];
    if (assembledSystemPrompt) {
      systemMessages.push({ role: 'system', content: assembledSystemPrompt });
    }

    const contextLimit = conversation.contextLimit ?? 128000;
    const contextResult = await this.contextService.prepareContext(
      conversationId,
      systemMessages,
      userContent,
      userModel,
      contextLimit,
    );

    const historyMessages = contextResult.messages;

    // 7. Emit: message_started
    onEvent({ type: 'message_started', messageId });
    this.logger.log(
      `Message processing started: id=${messageId} conv=${conversationId} model=${userModel}`,
    );

    const maxAttempts = message.maxAttempts;
    const startTime = Date.now();
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    let finalExecResult = '';

    try {
      // 8. Execute retry loop
      const result = await this.executeRetryLoop({
        messageId,
        userContent,
        historyMessages,
        assembledSystemPrompt,
        invariants,
        planningModel,
        validationModel,
        userModel,
        temperature,
        maxTokens,
        maxAttempts,
        startAttempt: 1,
        completedStepTypes: new Set(),
        previousPlanResult: '',
        previousExecResult: '',
        onEvent,
      });

      if (!result) {
        // Pipeline was paused or exhausted
        return;
      }

      finalExecResult = result.execResult;
      totalPromptTokens = result.totalPromptTokens;
      totalCompletionTokens = result.totalCompletionTokens;
      totalCost = result.totalCost;

      // 9. Update assistant content and status
      await this.messageRepository.updateAssistantContent(messageId, finalExecResult);
      await this.messageRepository.updateStatus(messageId, 'done');

      const durationMs = Date.now() - startTime;

      // Save meta
      await this.messageRepository.saveMeta(messageId, {
        appliedModel: userModel,
        appliedTemperature: temperature,
        appliedMaxTokens: maxTokens,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        cost: totalCost,
        durationMs,
        contextUsedTokens: contextResult.contextUsedTokens ?? 0,
        contextMaxTokens: contextResult.contextMaxTokens ?? 0,
        truncatedMessages: contextResult.truncatedMessages ?? 0,
        truncatedTokens: contextResult.truncatedTokens ?? 0,
      });

      // Save debug
      const allSteps = await this.stepRepository.findByMessageId(messageId);
      await this.messageRepository.saveDebug(messageId, {
        strategyType: 'pipeline',
        contextMessagesCount: contextResult.messages?.length ?? 0,
        contextMessagesAfterTruncation: contextResult.messages?.length ?? 0,
        strategyMetadata: {
          messageId,
          totalAttempts: result.finalAttempt,
          totalCost,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          steps: allSteps.map((s) => ({
            stepType: s.stepType,
            attempt: s.attemptNumber,
            status: s.status,
            model: s.model,
            promptTokens: s.promptTokens,
            completionTokens: s.completionTokens,
            cost: s.cost,
            durationMs: s.durationMs,
            validationPassed: s.validationPassed,
            validationReason: s.validationReason,
          })),
        },
      });

      // 10. Extract and apply facts if sticky_facts strategy
      try {
        const ctx = await this.contextService.getContext(conversationId);
        if (ctx && ctx.strategy_type === 'sticky_facts') {
          await this.contextService.extractAndApplyFacts(
            conversationId,
            userContent,
            finalExecResult,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to extract facts for message ${messageId}: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
      }

      // 11. Auto-title (first message in conversation)
      try {
        const messageCount = await this.messageRepository.getMessageCount(conversationId);
        if (messageCount <= 1) {
          const title = userContent.slice(0, 100).replace(/\n/g, ' ').trim();
          await this.conversationService.updateParams(conversationId, { title });
        }
      } catch (err) {
        this.logger.warn(
          `Failed to auto-title for conversation ${conversationId}: ${err instanceof Error ? err.message : 'Unknown'}`,
        );
      }

      // 12. Emit: done
      onEvent({
        type: 'done',
        messageId,
        response: finalExecResult,
        meta: {
          model: userModel,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          totalCost,
          durationMs,
        },
      });

      this.logger.log(
        `Message ${messageId}: completed, cost=$${totalCost.toFixed(4)}`,
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Message ${messageId} error: ${errorMsg}`, stack);

      await this.messageRepository.updateStatus(messageId, 'failed', undefined, errorMsg);
      onEvent({ type: 'failed', messageId, error: errorMsg });
    }
  }

  // ── Public: pause / resume / cancel ───────────────────────────────

  async pauseMessage(messageId: string): Promise<void> {
    await this.messageRepository.updateStatus(messageId, 'paused');
    this.logger.log(`Message ${messageId}: paused`);
  }

  async resumeMessage(
    messageId: string,
    onEvent: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }
    if (message.status !== 'paused') {
      throw new Error(`Cannot resume message with status: ${message.status}`);
    }

    const conversationId = message.conversationId;

    // Load completed steps for current attempt
    const completedSteps = await this.stepRepository.findCompletedByMessageAndAttempt(
      messageId,
      message.attemptNumber,
    );

    await this.messageRepository.updateStatus(messageId, 'processing');
    onEvent({ type: 'message_started', messageId });
    this.logger.log(`Message ${messageId}: resumed from attempt ${message.attemptNumber}`);

    // Determine which steps are already done
    const completedTypes = new Set(completedSteps.map((s) => s.stepType));
    const planStep = completedSteps.find((s) => s.stepType === 'planning');
    const execStep = completedSteps.find((s) => s.stepType === 'execution');

    const planResult = planStep?.outputResult
      ? typeof planStep.outputResult === 'string'
        ? planStep.outputResult
        : (planStep.outputResult as { text?: string })?.text || ''
      : '';
    const execResult = execStep?.outputResult
      ? typeof execStep.outputResult === 'string'
        ? execStep.outputResult
        : (execStep.outputResult as { text?: string })?.text || ''
      : '';

    // Reload conversation context
    // We need userId -- get it from the conversation record via DB
    const conversation = await this.loadConversationDirect(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384');
    const userModel = conversation.model || DEFAULT_MODEL;
    const temperature = conversation.temperature ?? 1.0;
    const maxTokens = conversation.maxTokens ?? envMaxTokens;
    const planningModel = 'gpt-4.1-nano';
    const validationModel = 'gpt-4.1-nano';

    // Assemble memory
    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      userId: conversation.userId,
      projectId: conversation.projectId || undefined,
      model: userModel,
    });
    const assembledSystemPrompt = memoryResult.systemPrompt || undefined;

    // Load invariants
    let invariants: string[] = [];
    if (conversation.projectId) {
      const rawInvariants = await this.projectService.getInvariantsByProjectId(conversation.projectId);
      invariants = this.guardService.filterInvariants(rawInvariants, conversation.projectId);
    }

    // Prepare context
    const systemMessages: Array<{ role: string; content: string }> = [];
    if (assembledSystemPrompt) {
      systemMessages.push({ role: 'system', content: assembledSystemPrompt });
    }

    const contextLimit = conversation.contextLimit ?? 128000;
    const contextResult = await this.contextService.prepareContext(
      conversationId,
      systemMessages,
      message.userContent,
      userModel,
      contextLimit,
    );

    const historyMessages = contextResult.messages;

    try {
      const result = await this.executeRetryLoop({
        messageId,
        userContent: message.userContent,
        historyMessages,
        assembledSystemPrompt,
        invariants,
        planningModel,
        validationModel,
        userModel,
        temperature,
        maxTokens,
        maxAttempts: message.maxAttempts,
        startAttempt: message.attemptNumber,
        completedStepTypes: completedTypes,
        previousPlanResult: planResult,
        previousExecResult: execResult,
        onEvent,
      });

      if (!result) {
        return;
      }

      const durationMs = Date.now();

      await this.messageRepository.updateAssistantContent(messageId, result.execResult);
      await this.messageRepository.updateStatus(messageId, 'done');

      await this.messageRepository.saveMeta(messageId, {
        appliedModel: userModel,
        appliedTemperature: temperature,
        appliedMaxTokens: maxTokens,
        promptTokens: result.totalPromptTokens,
        completionTokens: result.totalCompletionTokens,
        totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
        cost: result.totalCost,
      });

      onEvent({
        type: 'done',
        messageId,
        response: result.execResult,
        meta: {
          model: userModel,
          totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
          totalCost: result.totalCost,
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Message resume ${messageId} error: ${errorMsg}`, stack);
      await this.messageRepository.updateStatus(messageId, 'failed', undefined, errorMsg);
      onEvent({ type: 'failed', messageId, error: errorMsg });
    }
  }

  async cancelMessage(messageId: string): Promise<void> {
    await this.messageRepository.updateStatus(messageId, 'cancelled');
    this.logger.log(`Message ${messageId}: cancelled`);
  }

  // ── Private: deduplicated retry loop ──────────────────────────────

  private async executeRetryLoop(params: {
    messageId: string;
    userContent: string;
    historyMessages: Array<{ role: string; content: string }>;
    assembledSystemPrompt: string | undefined;
    invariants: string[];
    planningModel: string;
    validationModel: string;
    userModel: string;
    temperature: number;
    maxTokens: number;
    maxAttempts: number;
    startAttempt: number;
    completedStepTypes: Set<string>;
    previousPlanResult: string;
    previousExecResult: string;
    onEvent: (event: Record<string, unknown>) => void;
  }): Promise<{
    execResult: string;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    finalAttempt: number;
  } | null> {
    const {
      messageId,
      userContent,
      historyMessages,
      assembledSystemPrompt,
      invariants,
      planningModel,
      validationModel,
      userModel,
      temperature,
      maxTokens,
      maxAttempts,
      startAttempt,
      onEvent,
    } = params;

    let { completedStepTypes, previousPlanResult, previousExecResult } = params;
    let attempt = startAttempt;
    let lastValidationReason = '';
    let currentPlanResult = previousPlanResult;
    let currentExecResult = previousExecResult;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;

    while (attempt <= maxAttempts) {
      this.logger.log(`Message ${messageId}: attempt ${attempt}/${maxAttempts}`);

      // Check pause
      if (await this.isMessagePaused(messageId)) {
        onEvent({ type: 'step_complete', step: 'paused', result: 'Message paused' });
        break;
      }

      // ── PLANNING ──
      if (!completedStepTypes.has('planning') || attempt > startAttempt) {
        const planningMessages = this.stepRunnerService.buildPlanningMessages(
          assembledSystemPrompt,
          historyMessages,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
        );

        const planStepResult = await this.stepRunnerService.runStep({
          messageId,
          stepType: 'planning',
          attempt,
          model: planningModel,
          temperature,
          maxTokens,
          messages: planningMessages,
          onEvent,
        });

        currentPlanResult = planStepResult.output;
        totalPromptTokens += planStepResult.step.promptTokens;
        totalCompletionTokens += planStepResult.step.completionTokens;
        totalCost += planStepResult.step.cost;
      }

      if (await this.isMessagePaused(messageId)) {
        onEvent({ type: 'step_complete', step: 'paused', result: 'Message paused after planning' });
        break;
      }

      // ── EXECUTION ──
      if (!completedStepTypes.has('execution') || attempt > startAttempt) {
        const executionMessages = this.stepRunnerService.buildExecutionMessages(
          assembledSystemPrompt,
          currentPlanResult,
          userContent,
          invariants,
        );

        const execStepResult = await this.stepRunnerService.runStepWithTools({
          messageId,
          stepType: 'execution',
          attempt,
          model: userModel,
          temperature,
          maxTokens,
          messages: executionMessages,
          onEvent,
        });

        currentExecResult = execStepResult.output;
        totalPromptTokens += execStepResult.step.promptTokens;
        totalCompletionTokens += execStepResult.step.completionTokens;
        totalCost += execStepResult.step.cost;
      }

      if (await this.isMessagePaused(messageId)) {
        onEvent({ type: 'step_complete', step: 'paused', result: 'Message paused after execution' });
        break;
      }

      // ── VALIDATION ──
      if (!completedStepTypes.has('validation') || attempt > startAttempt) {
        const validationMessages = this.stepRunnerService.buildValidationMessages(
          currentPlanResult,
          currentExecResult,
          invariants,
        );

        const validStepResult = await this.stepRunnerService.runStep({
          messageId,
          stepType: 'validation',
          attempt,
          model: validationModel,
          temperature,
          maxTokens,
          messages: validationMessages,
          onEvent,
        });

        totalPromptTokens += validStepResult.step.promptTokens;
        totalCompletionTokens += validStepResult.step.completionTokens;
        totalCost += validStepResult.step.cost;

        const validation: ValidationResult = this.stepRunnerService.parseValidation(
          validStepResult.output,
        );

        // Update validation result on step
        await this.stepRepository.updateStep(validStepResult.step.id, {
          validationPassed: validation.passed,
          validationReason: validation.reason,
        });

        if (validation.injection) {
          await this.messageRepository.updateStatus(
            messageId,
            'failed',
            'validation',
            'injection_detected_by_validator',
          );
          onEvent({
            type: 'failed',
            messageId,
            error: 'Обнаружена попытка обхода pipeline',
          });
          this.logger.warn(
            `Message ${messageId}: injection detected by validator on attempt ${attempt}`,
          );
          return null;
        }

        if (validation.passed) {
          // Final gate: verify all 3 stages completed
          const integrityOk = await this.guardService.verifyStageIntegrity(
            messageId,
            attempt,
          );
          if (!integrityOk) {
            await this.messageRepository.updateStatus(
              messageId,
              'failed',
              'validation',
              'stage_integrity_check_failed',
            );
            onEvent({ type: 'error', error: 'Stage integrity check failed: missing completed steps' });
            this.logger.error(
              `Message ${messageId}: stage integrity check failed on attempt ${attempt}`,
            );
            return null;
          }

          return {
            execResult: currentExecResult,
            totalPromptTokens,
            totalCompletionTokens,
            totalCost,
            finalAttempt: attempt,
          };
        }

        // Validation failed
        lastValidationReason = validation.reason;
        onEvent({
          type: 'step_complete',
          step: 'validation_failed',
          result: validation.reason,
        });
        this.logger.warn(
          `Message ${messageId}: validation failed attempt ${attempt}, reason: ${validation.reason}`,
        );
      }

      // Clear completed set after first resumed iteration so next attempts run fresh
      completedStepTypes = new Set();
      attempt++;

      if (attempt <= maxAttempts) {
        await this.messageRepository.incrementAttempt(messageId);
      }
    }

    // Exhausted attempts or paused
    const currentMessage = await this.messageRepository.findById(messageId);
    if (currentMessage && currentMessage.status !== 'paused' && currentMessage.status !== 'done') {
      await this.messageRepository.updateStatus(
        messageId,
        'failed',
        undefined,
        'Exhausted all retry attempts',
      );
      onEvent({ type: 'failed', messageId, error: 'Exhausted all retry attempts' });
      this.logger.warn(`Message ${messageId}: failed after ${attempt - 1} attempts`);
    }

    return null;
  }

  // ── Private: helpers ──────────────────────────────────────────────

  private async isMessagePaused(messageId: string): Promise<boolean> {
    const message = await this.messageRepository.findById(messageId);
    return message?.status === 'paused';
  }

  private async loadConversationDirect(conversationId: string): Promise<{
    userId: string;
    projectId: string;
    model: string;
    temperature: number | null;
    maxTokens: number | null;
    contextLimit: number | null;
    systemPrompt: string | null;
  } | null> {
    // Use ConversationRepository via BaseRepository findById
    // ConversationService requires userId for auth, but on resume we may not have it.
    // MessageRepository has the conversationId, and we need the conversation data.
    // We access via the service's internal repository through a direct DB query.
    const result = await this.db.query(
      `SELECT user_id, project_id, model, temperature, max_tokens, context_limit, system_prompt
       FROM conversations WHERE id = $1`,
      [conversationId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      userId: row.user_id,
      projectId: row.project_id,
      model: row.model,
      temperature: row.temperature != null ? parseFloat(String(row.temperature)) : null,
      maxTokens: row.max_tokens ?? null,
      contextLimit: row.context_limit ?? null,
      systemPrompt: row.system_prompt ?? null,
    };
  }
}
