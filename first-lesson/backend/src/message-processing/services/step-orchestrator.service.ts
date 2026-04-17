import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MessageRepository } from '../../conversation/repositories/message.repository';
import { ConversationService } from '../../conversation/conversation.service';
import { ContextService } from '../../context/context.service';
import { MemoryAssemblerService } from '../../memory/memory-assembler.service';
import { ProjectService } from '../../project/project.service';
import { TokenService } from '../../ai/token.service';
import {
  StepRunnerService,
  ValidationResult,
  RagExecutionAudit,
  RagPlanningAssessment,
} from './step-runner.service';
import { GuardService } from './guard.service';
import { StepRepository, MessageStep } from '../repositories/step.repository';
import { ALLOWED_MODELS, DEFAULT_MODEL } from '../../ai/dto/ai-params.dto';
import { normalizeRagMode, type RagMode } from '../../rag/constants';
import { RagService } from '../../rag/rag.service';
import { RagContextResult, RagDebugContext } from '../../rag/rag.types';

// ── Types ─────────────────────────────────────────────────────────────

export interface ProcessMessageParams {
  messageId: string;
  conversationId: string;
  userId: string;
  projectId?: string;
  onEvent: (event: Record<string, unknown>) => void;
}

interface RetryLoopResult {
  execResult: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  finalAttempt: number;
  strictRagMode: boolean;
  ragPlanningAssessment: RagPlanningAssessment | null;
  ragExecutionAudit: RagExecutionAudit | null;
}

interface ResolvedStrictRagPlanning {
  assessment: RagPlanningAssessment;
  serializedPlan: string;
  repaired: boolean;
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
    private readonly ragService: RagService,
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
    const memorySystemPrompt = memoryResult.systemPrompt || undefined;

    const ragResult = conversation.ragEnabled
      ? await this.ragService.buildContextBlock(
          userContent,
          conversation.ragMode,
          conversation.ragQueryRewriteEnabled,
        )
      : createEmptyRagResult(userContent, conversation.ragMode, conversation.ragQueryRewriteEnabled);
    const ragEvidencePrompt = ragResult.block || undefined;

    // 5. Load invariants
    let invariants: string[] = [];
    if (projectId) {
      const rawInvariants = await this.projectService.getInvariantsByProjectId(projectId);
      invariants = this.guardService.filterInvariants(rawInvariants, projectId);
    }

    // 6. Prepare context
    const systemMessages: Array<{ role: string; content: string }> = [];
    if (memorySystemPrompt) {
      systemMessages.push({ role: 'system', content: memorySystemPrompt });
    }
    if (ragEvidencePrompt) {
      systemMessages.push({ role: 'system', content: ragEvidencePrompt });
    }

    const contextLimit = conversation.contextLimit ?? 128000;
    const contextResult = await this.contextService.prepareContext(
      conversationId,
      systemMessages,
      userContent,
      userModel,
      contextLimit,
    );

    const historyMessages = contextResult.messages.filter((msg) => msg.role !== 'system');

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
        memorySystemPrompt,
        ragEvidencePrompt,
        ragResult,
        strictRagMode: conversation.ragEnabled,
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
        conversationId,
        userId,
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
        strategyMetadata: buildPipelineStrategyMetadata(messageId, result, allSteps),
        ragContext: buildRagDebugContext(conversation.ragEnabled, ragResult),
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
    const memorySystemPrompt = memoryResult.systemPrompt || undefined;

    const ragResult = conversation.ragEnabled
      ? await this.ragService.buildContextBlock(
          message.userContent,
          conversation.ragMode,
          conversation.ragQueryRewriteEnabled,
        )
      : createEmptyRagResult(
          message.userContent,
          conversation.ragMode,
          conversation.ragQueryRewriteEnabled,
        );
    const ragEvidencePrompt = ragResult.block || undefined;

    // Load invariants
    let invariants: string[] = [];
    if (conversation.projectId) {
      const rawInvariants = await this.projectService.getInvariantsByProjectId(conversation.projectId);
      invariants = this.guardService.filterInvariants(rawInvariants, conversation.projectId);
    }

    // Prepare context
    const systemMessages: Array<{ role: string; content: string }> = [];
    if (memorySystemPrompt) {
      systemMessages.push({ role: 'system', content: memorySystemPrompt });
    }
    if (ragEvidencePrompt) {
      systemMessages.push({ role: 'system', content: ragEvidencePrompt });
    }

    const contextLimit = conversation.contextLimit ?? 128000;
    const contextResult = await this.contextService.prepareContext(
      conversationId,
      systemMessages,
      message.userContent,
      userModel,
      contextLimit,
    );

    const historyMessages = contextResult.messages.filter((msg) => msg.role !== 'system');

    try {
      const result = await this.executeRetryLoop({
        messageId,
        userContent: message.userContent,
        historyMessages,
        memorySystemPrompt,
        ragEvidencePrompt,
        ragResult,
        strictRagMode: conversation.ragEnabled,
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
        conversationId,
        userId: conversation.userId,
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

      const allSteps = await this.stepRepository.findByMessageId(messageId);
      await this.messageRepository.saveDebug(messageId, {
        strategyType: 'pipeline',
        contextMessagesCount: contextResult.messages?.length ?? 0,
        contextMessagesAfterTruncation: contextResult.messages?.length ?? 0,
        strategyMetadata: buildPipelineStrategyMetadata(messageId, result, allSteps),
        ragContext: buildRagDebugContext(conversation.ragEnabled, ragResult),
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
    memorySystemPrompt: string | undefined;
    ragEvidencePrompt: string | undefined;
    ragResult: RagContextResult;
    strictRagMode: boolean;
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
    conversationId?: string;
    userId?: string;
  }): Promise<RetryLoopResult | null> {
    const {
      messageId,
      userContent,
      historyMessages,
      memorySystemPrompt,
      ragEvidencePrompt,
      ragResult,
      strictRagMode,
      invariants,
      planningModel,
      validationModel,
      userModel,
      temperature,
      maxTokens,
      maxAttempts,
      startAttempt,
      onEvent,
      conversationId,
      userId,
    } = params;

    let { completedStepTypes, previousPlanResult, previousExecResult } = params;
    let attempt = startAttempt;
    let lastValidationReason = '';
    let currentPlanResult = previousPlanResult;
    let currentExecResult = previousExecResult;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    let currentRagPlanningAssessment: RagPlanningAssessment | null = null;
    let currentRagExecutionAudit: RagExecutionAudit | null = null;
    let currentPlanningStep: MessageStep | null = null;

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
          memorySystemPrompt,
          historyMessages,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
          ragEvidencePrompt,
          strictRagMode,
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
        currentPlanningStep = planStepResult.step;
        totalPromptTokens += planStepResult.step.promptTokens;
        totalCompletionTokens += planStepResult.step.completionTokens;
        totalCost += planStepResult.step.cost;
      }

      if (strictRagMode) {
        try {
          const resolvedPlanning = this.resolveStrictRagPlanning(
            currentPlanResult,
            ragResult,
            userContent,
          );
          currentRagPlanningAssessment = resolvedPlanning.assessment;
          currentPlanResult = resolvedPlanning.serializedPlan;

          if (currentPlanningStep) {
            await this.stepRepository.updateStep(currentPlanningStep.id, {
              outputResult: {
                text: currentPlanResult,
                rawText: currentRagPlanningAssessment.raw,
                source: currentRagPlanningAssessment.source,
                repairReason: currentRagPlanningAssessment.repairReason,
              },
            });
          }

          if (resolvedPlanning.repaired) {
            this.logger.warn(
              `Message ${messageId}: strict RAG planning repaired on attempt ${attempt}: ${currentRagPlanningAssessment.repairReason}`,
            );
          }
        } catch (err: unknown) {
          lastValidationReason = err instanceof Error ? err.message : 'Invalid strict RAG planning output';
          this.logger.warn(
            `Message ${messageId}: strict RAG planning rejected on attempt ${attempt}: ${lastValidationReason}`,
          );

          completedStepTypes = new Set();
          attempt++;
          if (attempt <= maxAttempts) {
            await this.messageRepository.incrementAttempt(messageId);
          }
          continue;
        }
      }

      if (await this.isMessagePaused(messageId)) {
        onEvent({ type: 'step_complete', step: 'paused', result: 'Message paused after planning' });
        break;
      }

      // ── EXECUTION ──
      if (!completedStepTypes.has('execution') || attempt > startAttempt) {
        const executionMessages = this.stepRunnerService.buildExecutionMessages(
          memorySystemPrompt,
          currentPlanResult,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
          ragEvidencePrompt,
          strictRagMode,
        );

        const execStepResult = strictRagMode
          ? await this.stepRunnerService.runStep({
              messageId,
              stepType: 'execution',
              attempt,
              model: userModel,
              temperature,
              maxTokens,
              messages: executionMessages,
              onEvent,
            })
          : await this.stepRunnerService.runStepWithTools({
              messageId,
              stepType: 'execution',
              attempt,
              model: userModel,
              temperature,
              maxTokens,
              messages: executionMessages,
              onEvent,
              conversationId,
              userId,
            });

        currentExecResult = execStepResult.output;
        currentRagExecutionAudit = null;
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
          memorySystemPrompt,
          userContent,
          currentPlanResult,
          currentExecResult,
          invariants,
          ragEvidencePrompt,
          strictRagMode,
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

        if (validation.passed && strictRagMode && currentRagPlanningAssessment) {
          const ragExecutionVerification = this.stepRunnerService.verifyRagExecutionOutput(
            currentExecResult,
            currentRagPlanningAssessment,
          );
          currentRagExecutionAudit = ragExecutionVerification.audit;
          if (!ragExecutionVerification.ok) {
            validation.passed = false;
            validation.reason =
              ragExecutionVerification.reason ??
              'Execution не прошёл кодовую проверку строгого RAG-режима';
          }
        }

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
          if (strictRagMode && currentRagPlanningAssessment && currentRagExecutionAudit) {
            currentExecResult = this.stepRunnerService.renderStrictRagResponse(
              currentRagPlanningAssessment,
              currentRagExecutionAudit,
              ragResult,
            );
          }

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
            strictRagMode,
            ragPlanningAssessment: currentRagPlanningAssessment,
            ragExecutionAudit: currentRagExecutionAudit,
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

  private resolveStrictRagPlanning(
    rawPlanResult: string,
    ragResult: RagContextResult,
    userContent: string,
  ): ResolvedStrictRagPlanning {
    try {
      const parsedAssessment = this.stepRunnerService.parseRagPlanningAssessment(rawPlanResult);
      const planningAssessmentError = validateRagPlanningAssessment(
        parsedAssessment,
        ragResult,
        userContent,
      );

      if (!planningAssessmentError) {
        return {
          assessment: parsedAssessment,
          serializedPlan: this.stepRunnerService.serializeRagPlanningAssessment(parsedAssessment),
          repaired: false,
        };
      }

      const repairedAssessment = tryRepairStrictRagPlanning(
        rawPlanResult,
        planningAssessmentError,
        ragResult,
        userContent,
      );

      if (!repairedAssessment) {
        throw new Error(planningAssessmentError);
      }

      return {
        assessment: repairedAssessment,
        serializedPlan: this.stepRunnerService.serializeRagPlanningAssessment(repairedAssessment),
        repaired: true,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Invalid strict RAG planning output';
      const repairedAssessment = tryRepairStrictRagPlanning(
        rawPlanResult,
        errorMessage,
        ragResult,
        userContent,
      );

      if (!repairedAssessment) {
        throw err;
      }

      return {
        assessment: repairedAssessment,
        serializedPlan: this.stepRunnerService.serializeRagPlanningAssessment(repairedAssessment),
        repaired: true,
      };
    }
  }

  private async loadConversationDirect(conversationId: string): Promise<{
    userId: string;
    projectId: string;
    model: string;
    temperature: number | null;
    maxTokens: number | null;
    contextLimit: number | null;
    systemPrompt: string | null;
    ragEnabled: boolean;
    ragQueryRewriteEnabled: boolean;
    ragMode: RagMode;
  } | null> {
    // Use ConversationRepository via BaseRepository findById
    // ConversationService requires userId for auth, but on resume we may not have it.
    // MessageRepository has the conversationId, and we need the conversation data.
    // We access via the service's internal repository through a direct DB query.
    const result = await this.db.query(
      `SELECT user_id, project_id, model, temperature, max_tokens, context_limit, system_prompt, rag_enabled, rag_query_rewrite_enabled, rag_mode
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
      ragEnabled: Boolean(row.rag_enabled),
      ragQueryRewriteEnabled: Boolean(row.rag_query_rewrite_enabled),
      ragMode: normalizeRagMode(row.rag_mode),
    };
  }
}

function buildRagDebugContext(enabled: boolean, ragResult: RagContextResult): RagDebugContext {
  return {
    enabled,
    mode: ragResult.mode,
    scoreType: ragResult.scoreType,
    candidateCount: ragResult.candidateCount,
    matchCount: ragResult.selectedCount,
    selectedCount: ragResult.selectedCount,
    queryRewrite: ragResult.queryRewrite,
    matches: ragResult.matches.map((match, index) => ({
      rank: index + 1,
      chunkId: match.chunkId,
      documentId: match.documentId,
      similarity: match.similarity,
      rankingScore: match.rankingScore,
      tokenOverlapCount: match.tokenOverlapCount,
      rerankerScore: match.rerankerScore,
    })),
  };
}

function createEmptyRagResult(
  query: string,
  mode: RagMode,
  queryRewriteEnabled: boolean,
): RagContextResult {
  const normalizedQuery = query.trim();
  return {
    block: '',
    mode,
    scoreType: mode === 'reranker' ? 'reranker' : 'heuristic',
    candidateCount: 0,
    selectedCount: 0,
    queryRewrite: {
      enabled: queryRewriteEnabled,
      applied: false,
      rawApplied: false,
      reason: null,
      originalQuery: normalizedQuery,
      rewrittenQuery: normalizedQuery,
      model: null,
    },
    matches: [],
  };
}

function buildPipelineStrategyMetadata(
  messageId: string,
  result: RetryLoopResult,
  allSteps: MessageStep[],
) {
  return {
    messageId,
    totalAttempts: result.finalAttempt,
    totalCost: result.totalCost,
    totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
    steps: allSteps.map((step) => ({
      stepType: step.stepType,
      attempt: step.attemptNumber,
      status: step.status,
      model: step.model,
      promptTokens: step.promptTokens,
      completionTokens: step.completionTokens,
      cost: step.cost,
      durationMs: step.durationMs,
      validationPassed: step.validationPassed,
      validationReason: step.validationReason,
    })),
    ragPipeline: result.strictRagMode
      ? {
          strictMode: true,
          planning: result.ragPlanningAssessment
            ? {
                ragVerdict: result.ragPlanningAssessment.ragVerdict,
                responseMode: result.ragPlanningAssessment.responseMode,
                chunkIds: result.ragPlanningAssessment.chunkIds,
                missingInfo: result.ragPlanningAssessment.missingInfo,
                planText: result.ragPlanningAssessment.planText,
                source: result.ragPlanningAssessment.source,
                repairReason: result.ragPlanningAssessment.repairReason,
              }
            : null,
          execution: result.ragExecutionAudit
            ? {
                mode: result.ragExecutionAudit.mode,
                referencedChunkIds: result.ragExecutionAudit.referencedChunkIds,
                quoteCount: result.ragExecutionAudit.quoteCount,
                refusalReason: result.ragExecutionAudit.refusalReason,
                missingInfo: result.ragExecutionAudit.missingInfo,
              }
            : null,
        }
      : null,
  };
}

function validateRagPlanningAssessment(
  assessment: RagPlanningAssessment,
  ragResult: RagContextResult,
  userContent: string,
): string | null {
  const availableChunkIds = new Set(ragResult.matches.map((match) => match.chunkId));

  for (const chunkId of assessment.chunkIds) {
    if (!availableChunkIds.has(chunkId)) {
      return `Planning выбрал chunk_id вне текущего RAG-блока: ${chunkId}`;
    }
  }

  if (assessment.responseMode === 'ANSWER') {
    if (assessment.missingInfo.toUpperCase() !== 'NONE') {
      return 'Planning выбрал ANSWER, хотя MISSING_INFO не равно NONE';
    }
    if (assessment.chunkIds.length === 0) {
      return 'Planning выбрал ANSWER без CHUNKS_USED';
    }
  }

  if (assessment.responseMode === 'REFUSE' && assessment.missingInfo.toUpperCase() === 'NONE') {
    return 'Planning выбрал REFUSE, но не указал чего не хватает в MISSING_INFO';
  }

  if (assessment.responseMode === 'REFUSE') {
    const falseInsufficientReason = detectFalseInsufficientPlanning(
      assessment,
      ragResult,
      userContent,
    );
    if (falseInsufficientReason) {
      return falseInsufficientReason;
    }
  }

  return null;
}

function detectFalseInsufficientPlanning(
  assessment: RagPlanningAssessment,
  ragResult: RagContextResult,
  userContent: string,
): string | null {
  const strongMatches = findStrongDirectEvidenceMatches(ragResult, userContent);
  if (strongMatches.length === 0) {
    return null;
  }

  const chunkIds = strongMatches
    .slice(0, 3)
    .map((match) => match.chunkId)
    .join(', ');

  return `Planning выбрал ${assessment.responseMode}, хотя в текущем RAG-блоке уже есть прямые релевантные чанки для ответа: ${chunkIds}`;
}

function tryRepairStrictRagPlanning(
  rawPlanResult: string,
  originalReason: string,
  ragResult: RagContextResult,
  userContent: string,
): RagPlanningAssessment | null {
  const strongMatches = findStrongDirectEvidenceMatches(ragResult, userContent);
  if (strongMatches.length === 0) {
    return null;
  }

  const repairedChunkIds = strongMatches
    .slice(0, Math.min(3, strongMatches.length))
    .map((match) => match.chunkId);

  return {
    ragVerdict: 'SUFFICIENT',
    responseMode: 'ANSWER',
    chunkIds: repairedChunkIds,
    missingInfo: 'NONE',
    planText: [
      '1. Использовать только перечисленные chunk_id как источник фактов по запросу пользователя.',
      '2. Сформулировать краткий ответ без внешних знаний и без домысливания.',
      '3. Для каждого тезиса привести короткую дословную цитату и пояснение, как она подтверждает ответ.',
    ].join('\n'),
    source: 'policy_repair',
    repairReason: originalReason,
    raw: rawPlanResult,
  };
}

function findStrongDirectEvidenceMatches(
  ragResult: RagContextResult,
  userContent: string,
): RagContextResult['matches'] {
  const effectiveQuery = (ragResult.queryRewrite.rewrittenQuery || userContent).trim();
  if (!looksLikeBroadAnswerableQuestion(effectiveQuery)) {
    return [];
  }

  const strongMatches = ragResult.matches.filter((match) =>
    isStrongDirectEvidenceMatch(match, effectiveQuery),
  );
  return strongMatches;
}

function looksLikeBroadAnswerableQuestion(query: string): boolean {
  const normalized = normalizePlanningText(query);
  return /(?:^|\s)(какие|что|какой|какова|каковы|в чем|в чём|перечисли|назови|опиши|что не так|проблем|трабл|ошиб|огранич|что писал|что говорил|что знает|что думает|what|which|problems?|issues?)(?:\s|$)/iu.test(
    normalized,
  );
}

function isStrongDirectEvidenceMatch(
  match: RagContextResult['matches'][number],
  query: string,
): boolean {
  const score = match.rerankerScore ?? match.rankingScore ?? match.similarity;
  const normalizedQuery = normalizePlanningText(query);
  const normalizedContent = normalizePlanningText(match.content);
  const signalTokens = extractPlanningSignalTokens(normalizedQuery);
  const tokenHits = signalTokens.filter((token) => normalizedContent.includes(token)).length;
  const longEnough = match.content.trim().length >= 140;
  const scoreStrong = score >= 0.45 || match.similarity >= 0.5;
  const hasIssueSignal = /(?:проблем|трабл|ошиб|сбой|лимит|огранич|галлюцин|сжат|теря|потер|ослеп|слеп|утроил|расход|ложнополож|ast|tool|context|контекст)/iu.test(
    normalizedContent,
  );

  if (isProblemStyleQuestion(normalizedQuery)) {
    return longEnough && scoreStrong && tokenHits >= 1 && hasIssueSignal;
  }

  return longEnough && scoreStrong && tokenHits >= 1;
}

function isProblemStyleQuestion(query: string): boolean {
  return /(?:проблем|трабл|что не так|ошиб|сбой|лимит|огранич|issue|problem)/iu.test(query);
}

function extractPlanningSignalTokens(query: string): string[] {
  const stopwords = new Set([
    'какие',
    'какой',
    'какова',
    'каковы',
    'что',
    'где',
    'когда',
    'были',
    'было',
    'есть',
    'про',
    'это',
    'эти',
    'those',
    'what',
    'which',
    'were',
    'with',
    'about',
    'проблемы',
    'problem',
    'problems',
    'issues',
    'issue',
    'траблы',
    'ошибки',
  ]);

  return Array.from(
    new Set(
      query
        .split(/[^a-zа-я0-9#+.-]+/iu)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopwords.has(token)),
    ),
  );
}

function normalizePlanningText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}
