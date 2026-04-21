import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MessageRepository } from '../../conversation/repositories/message.repository';
import { ConversationService } from '../../conversation/conversation.service';
import { ContextService } from '../../context/context.service';
import {
  MemoryAssemblerService,
  type MemoryLayer,
} from '../../memory/memory-assembler.service';
import { ProjectService } from '../../project/project.service';
import { GuardService } from './guard.service';
import { StepRepository, MessageStep } from '../repositories/step.repository';
import {
  StepRunnerService,
  ValidationResult,
} from './step-runner.service';
import {
  AIProvider,
  resolveStoredAISelection,
} from '../../ai/dto/ai-params.dto';
import { normalizeRagMode, type RagMode } from '../../rag/constants';
import { RagContextResult, RagDebugContext } from '../../rag/rag.types';
import { ContextStrategyResult } from '../../context/strategies/context-strategy.interface';
import { MessageProcessingStrategyResolverService } from './strategies/message-processing-strategy-resolver.service';
import { StrategyResolution } from './strategies/message-processing-strategy.interface';

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
  resolution: StrategyResolution;
  strategyDebug: Record<string, unknown> | null;
  contextResult: ContextStrategyResult;
}

interface RuntimeConversationSettings {
  userId: string;
  projectId: string | null;
  provider: AIProvider;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  contextLimit: number | null;
  systemPrompt: string | null;
  ragEnabled: boolean;
  ragQueryRewriteEnabled: boolean;
  ragMode: RagMode;
}

const INTERNAL_PLANNING_MODEL = 'gpt-4.1-mini';
const INTERNAL_VALIDATION_MODEL = 'gpt-4.1-mini';
const INTERNAL_LLM_PROVIDER: AIProvider = 'openai';
const INTERNAL_PLANNING_TEMPERATURE = 0.2;
const INTERNAL_VALIDATION_TEMPERATURE = 0;

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
    private readonly stepRepository: StepRepository,
    private readonly strategyResolver: MessageProcessingStrategyResolverService,
  ) {}

  async processMessage(params: ProcessMessageParams): Promise<void> {
    const { messageId, conversationId, userId, projectId, onEvent } = params;

    await this.messageRepository.updateStatus(messageId, 'processing');

    const conversation = await this.conversationService.findOne(userId, conversationId);
    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384', 10);
    const userSelection = resolveStoredAISelection({
      provider: conversation.provider,
      model: conversation.model,
    });
    const userProvider = userSelection.provider;
    const userModel = userSelection.model;
    const executionTemperature = conversation.temperature ?? 1.0;
    const maxTokens = conversation.maxTokens ?? envMaxTokens;

    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      onEvent({ type: 'error', error: 'Message not found' });
      return;
    }

    const userContent = message.userContent;
    const guardCheck = this.guardService.checkMessage(userContent);
    if (guardCheck.blocked) {
      const blockMessage =
        'Ваше сообщение содержит инструкции, которые нарушают порядок работы pipeline';
      await this.messageRepository.updateAssistantContent(messageId, blockMessage);
      await this.messageRepository.updateStatus(messageId, 'done');
      onEvent({ type: 'done', messageId, response: blockMessage, meta: {} });
      this.logger.warn(
        `Injection detected in message ${messageId}, pattern=${guardCheck.matchedPattern}`,
      );
      return;
    }

    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      userId,
      projectId,
      userSystemPrompt: conversation.systemPrompt?.trim()?.slice(0, 4000) || undefined,
      model: userModel,
    });
    const memorySystemPrompt = memoryResult.systemPrompt || undefined;
    const invariants = await this.loadInvariants(userId, projectId);

    onEvent({ type: 'message_started', messageId });
    this.logger.log(
      `Message processing started: id=${messageId} conv=${conversationId} model=${userModel}`,
    );

    const startTime = Date.now();

    try {
      const result = await this.executeRetryLoop({
        messageId,
        conversationId,
        userId,
        userContent,
        memorySystemPrompt,
        invariants,
        userProvider,
        userModel,
        planningProvider: INTERNAL_LLM_PROVIDER,
        planningModel: INTERNAL_PLANNING_MODEL,
        validationProvider: INTERNAL_LLM_PROVIDER,
        validationModel: INTERNAL_VALIDATION_MODEL,
        executionTemperature,
        planningTemperature: INTERNAL_PLANNING_TEMPERATURE,
        validationTemperature: INTERNAL_VALIDATION_TEMPERATURE,
        maxTokens,
        maxAttempts: message.maxAttempts,
        startAttempt: 1,
        completedStepTypes: new Set(),
        previousPlanResult: '',
        previousExecResult: '',
        previousPlanningStep: null,
        ragEnabled: conversation.ragEnabled,
        ragMode: conversation.ragMode,
        ragQueryRewriteEnabled: conversation.ragQueryRewriteEnabled,
        contextLimit: conversation.contextLimit ?? 128000,
        onEvent,
      });

      if (!result) {
        return;
      }

      const durationMs = Date.now() - startTime;
      await this.finalizeSuccessfulMessage({
        messageId,
        conversationId,
        userId,
        projectId,
        userContent,
        userProvider,
        userModel,
        executionTemperature,
        maxTokens,
        memoryResult,
        result,
        durationMs,
        onEvent,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Message ${messageId} error: ${errorMessage}`, stack);

      await this.messageRepository.updateStatus(messageId, 'failed', undefined, errorMessage);
      onEvent({ type: 'failed', messageId, error: errorMessage });
    }
  }

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

    const completedSteps = await this.stepRepository.findCompletedByMessageAndAttempt(
      messageId,
      message.attemptNumber,
    );
    const completedTypes = new Set(completedSteps.map((step) => step.stepType));
    const planStep = completedSteps.find((step) => step.stepType === 'planning') ?? null;
    const execStep = completedSteps.find((step) => step.stepType === 'execution') ?? null;

    const conversation = await this.loadConversationDirect(message.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    await this.messageRepository.updateStatus(messageId, 'processing');
    onEvent({ type: 'message_started', messageId });
    this.logger.log(`Message ${messageId}: resumed from attempt ${message.attemptNumber}`);

    const envMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '16384', 10);
    const userSelection = resolveStoredAISelection({
      provider: conversation.provider,
      model: conversation.model,
    });
    const userProvider = userSelection.provider;
    const userModel = userSelection.model;
    const executionTemperature = conversation.temperature ?? 1.0;
    const maxTokens = conversation.maxTokens ?? envMaxTokens;

    const memoryResult = await this.memoryAssemblerService.assembleMemory({
      userId: conversation.userId,
      projectId: conversation.projectId || undefined,
      userSystemPrompt: conversation.systemPrompt?.trim()?.slice(0, 4000) || undefined,
      model: userModel,
    });
    const memorySystemPrompt = memoryResult.systemPrompt || undefined;
    const invariants = await this.loadInvariants(
      conversation.userId,
      conversation.projectId || undefined,
    );

    const startTime = Date.now();

    try {
      const result = await this.executeRetryLoop({
        messageId,
        conversationId: message.conversationId,
        userId: conversation.userId,
        userContent: message.userContent,
        memorySystemPrompt,
        invariants,
        userProvider,
        userModel,
        planningProvider: INTERNAL_LLM_PROVIDER,
        planningModel: INTERNAL_PLANNING_MODEL,
        validationProvider: INTERNAL_LLM_PROVIDER,
        validationModel: INTERNAL_VALIDATION_MODEL,
        executionTemperature,
        planningTemperature: INTERNAL_PLANNING_TEMPERATURE,
        validationTemperature: INTERNAL_VALIDATION_TEMPERATURE,
        maxTokens,
        maxAttempts: message.maxAttempts,
        startAttempt: message.attemptNumber,
        completedStepTypes: completedTypes,
        previousPlanResult: extractStepText(planStep),
        previousExecResult: extractStepText(execStep),
        previousPlanningStep: planStep,
        ragEnabled: conversation.ragEnabled,
        ragMode: conversation.ragMode,
        ragQueryRewriteEnabled: conversation.ragQueryRewriteEnabled,
        contextLimit: conversation.contextLimit ?? 128000,
        onEvent,
      });

      if (!result) {
        return;
      }

      const durationMs = Date.now() - startTime;
      await this.finalizeSuccessfulMessage({
        messageId,
        conversationId: message.conversationId,
        userId: conversation.userId,
        projectId: conversation.projectId || undefined,
        userContent: message.userContent,
        userProvider,
        userModel,
        executionTemperature,
        maxTokens,
        memoryResult,
        result,
        durationMs,
        onEvent,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Message resume ${messageId} error: ${errorMessage}`, stack);
      await this.messageRepository.updateStatus(messageId, 'failed', undefined, errorMessage);
      onEvent({ type: 'failed', messageId, error: errorMessage });
    }
  }

  async cancelMessage(messageId: string): Promise<void> {
    await this.messageRepository.updateStatus(messageId, 'cancelled');
    this.logger.log(`Message ${messageId}: cancelled`);
  }

  private async finalizeSuccessfulMessage(params: {
    messageId: string;
    conversationId: string;
    userId: string;
    projectId?: string;
    userContent: string;
    userProvider: AIProvider;
    userModel: string;
    executionTemperature: number;
    maxTokens: number;
    memoryResult: Awaited<ReturnType<MemoryAssemblerService['assembleMemory']>>;
    result: RetryLoopResult;
    durationMs: number;
    onEvent: (event: Record<string, unknown>) => void;
  }): Promise<void> {
    const {
      messageId,
      conversationId,
      userContent,
      userProvider,
      userModel,
      executionTemperature,
      maxTokens,
      memoryResult,
      result,
      durationMs,
      onEvent,
    } = params;

    await this.messageRepository.updateAssistantContent(messageId, result.execResult);
    await this.messageRepository.updateStatus(messageId, 'done');

    await this.messageRepository.saveMeta(messageId, {
      appliedProvider: userProvider,
      appliedModel: userModel,
      appliedTemperature: executionTemperature,
      appliedMaxTokens: maxTokens,
      promptTokens: result.totalPromptTokens,
      completionTokens: result.totalCompletionTokens,
      totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
      cost: result.totalCost,
      durationMs,
      contextUsedTokens: result.contextResult.contextUsedTokens ?? 0,
      contextMaxTokens: result.contextResult.contextMaxTokens ?? 0,
      truncatedMessages: result.contextResult.truncatedMessages ?? 0,
      truncatedTokens: result.contextResult.truncatedTokens ?? 0,
    });

    const allSteps = await this.stepRepository.findByMessageId(messageId);
    await this.messageRepository.saveDebug(messageId, {
      strategyType: result.contextResult.strategyType,
      contextMessagesCount: getOriginalContextMessageCount(result.contextResult),
      contextMessagesAfterTruncation: result.contextResult.messages?.length ?? 0,
      factsSnapshot: result.contextResult.debugInfo?.factsSnapshot ?? null,
      branchInfo: null,
      strategyMetadata: {
        ...buildPipelineStrategyMetadata(messageId, result, allSteps),
        context: result.contextResult.debugInfo ?? null,
      },
      ragContext: buildRagDebugContext(
        result.resolution.requestedKind === 'rag',
        result.resolution.ragResult,
      ),
      memoryLayers: toDebugMemoryLayers(memoryResult.layers),
    });

    try {
      const ctx = await this.contextService.getContext(conversationId);
      if (ctx && ctx.strategy_type === 'sticky_facts') {
        await this.contextService.extractAndApplyFacts(
          conversationId,
          userContent,
          result.execResult,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to extract facts for message ${messageId}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    try {
      const messageCount = await this.messageRepository.getMessageCount(conversationId);
      if (messageCount <= 1) {
        const title = userContent.slice(0, 100).replace(/\n/g, ' ').trim();
        await this.conversationService.updateParams(conversationId, { title });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to auto-title for conversation ${conversationId}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }

    onEvent({
      type: 'done',
      messageId,
      response: result.execResult,
      meta: {
        provider: userProvider,
        model: userModel,
        totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
        totalCost: result.totalCost,
        durationMs,
      },
    });

    this.logger.log(`Message ${messageId}: completed, cost=$${result.totalCost.toFixed(4)}`);
  }

  private async executeRetryLoop(params: {
    messageId: string;
    conversationId: string;
    userId: string;
    userContent: string;
    memorySystemPrompt: string | undefined;
    invariants: string[];
    userProvider: AIProvider;
    userModel: string;
    planningProvider: AIProvider;
    planningModel: string;
    validationProvider: AIProvider;
    validationModel: string;
    executionTemperature: number;
    planningTemperature: number;
    validationTemperature: number;
    maxTokens: number;
    maxAttempts: number;
    startAttempt: number;
    completedStepTypes: Set<string>;
    previousPlanResult: string;
    previousExecResult: string;
    previousPlanningStep: MessageStep | null;
    ragEnabled: boolean;
    ragMode: RagMode;
    ragQueryRewriteEnabled: boolean;
    contextLimit: number;
    onEvent: (event: Record<string, unknown>) => void;
  }): Promise<RetryLoopResult | null> {
    const {
      messageId,
      conversationId,
      userId,
      userContent,
      memorySystemPrompt,
      invariants,
      userProvider,
      userModel,
      planningProvider,
      planningModel,
      validationProvider,
      validationModel,
      executionTemperature,
      planningTemperature,
      validationTemperature,
      maxTokens,
      maxAttempts,
      startAttempt,
      ragEnabled,
      ragMode,
      ragQueryRewriteEnabled,
      contextLimit,
      onEvent,
    } = params;

    let { completedStepTypes, previousPlanResult, previousExecResult, previousPlanningStep } =
      params;
    let attempt = startAttempt;
    let lastValidationReason = '';
    let currentPlanResult = previousPlanResult;
    let currentExecResult = previousExecResult;
    let currentPlanningStep = previousPlanningStep;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;

    while (attempt <= maxAttempts) {
      this.logger.log(`Message ${messageId}: attempt ${attempt}/${maxAttempts}`);

      if (await this.isMessagePaused(messageId)) {
        onEvent({ type: 'step_complete', step: 'paused', result: 'Message paused' });
        break;
      }

      const resolution = await this.strategyResolver.resolve({
        ragEnabled,
        ragMode,
        ragQueryRewriteEnabled,
        conversationId,
        userContent,
      });

      if (completedStepTypes.has('planning') && currentPlanResult) {
        const existingStrategyKind =
          this.strategyResolver.inferStrategyKindFromPlanning(currentPlanResult);

        if (existingStrategyKind !== resolution.effectiveKind) {
          lastValidationReason =
            `Стратегия обработки изменилась с ${existingStrategyKind} на ${resolution.effectiveKind}; текущая попытка будет запущена заново`;
          this.logger.warn(
            `Message ${messageId}: strategy changed between resume and fresh resolution (${existingStrategyKind} -> ${resolution.effectiveKind}), restarting attempt`,
          );

          completedStepTypes = new Set();
          currentPlanResult = '';
          currentExecResult = '';
          currentPlanningStep = null;
          attempt++;
          if (attempt <= maxAttempts) {
            await this.messageRepository.incrementAttempt(messageId);
          }
          continue;
        }
      }

      const contextResult = await this.prepareAttemptContext({
        conversationId,
        userContent,
        userModel,
        contextLimit,
        memorySystemPrompt,
        resolution,
      });
      const contextMessages = contextResult.messages;

      if (!completedStepTypes.has('planning') || attempt > startAttempt) {
        const planningMessages = resolution.strategy.buildPlanningMessages({
          assembledSystemPrompt: memorySystemPrompt,
          contextMessages,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
          resolution,
        });

        const planningStepResult = await this.stepRunnerService.runStep({
          messageId,
          stepType: 'planning',
          attempt,
          provider: planningProvider,
          model: planningModel,
          temperature: planningTemperature,
          maxTokens,
          messages: planningMessages,
          onEvent,
        });

        currentPlanResult = planningStepResult.output;
        currentPlanningStep = planningStepResult.step;
        totalPromptTokens += planningStepResult.step.promptTokens;
        totalCompletionTokens += planningStepResult.step.completionTokens;
        totalCost += planningStepResult.step.cost;
      }

      try {
        const normalizedPlanning = resolution.strategy.normalizePlanningResult(
          currentPlanResult,
          resolution,
          userContent,
        );
        const shouldUpdatePlanningStep =
          Boolean(normalizedPlanning.stepOutputOverride) ||
          normalizedPlanning.planResult !== currentPlanResult;

        currentPlanResult = normalizedPlanning.planResult;

        if (shouldUpdatePlanningStep && currentPlanningStep) {
          await this.stepRepository.updateStep(currentPlanningStep.id, {
            outputResult:
              normalizedPlanning.stepOutputOverride ?? { text: currentPlanResult },
          });
        }
      } catch (error: unknown) {
        lastValidationReason =
          error instanceof Error
            ? error.message
            : 'Некорректный результат planning для выбранной стратегии';
        this.logger.warn(
          `Message ${messageId}: planning rejected on attempt ${attempt}: ${lastValidationReason}`,
        );

        completedStepTypes = new Set();
        currentPlanResult = '';
        currentExecResult = '';
        currentPlanningStep = null;
        attempt++;
        if (attempt <= maxAttempts) {
          await this.messageRepository.incrementAttempt(messageId);
        }
        continue;
      }

      if (await this.isMessagePaused(messageId)) {
        onEvent({
          type: 'step_complete',
          step: 'paused',
          result: 'Message paused after planning',
        });
        break;
      }

      if (!completedStepTypes.has('execution') || attempt > startAttempt) {
        const executionMessages = resolution.strategy.buildExecutionMessages({
          assembledSystemPrompt: memorySystemPrompt,
          contextMessages,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
          resolution,
          planResult: currentPlanResult,
        });

        const executionStepResult = await resolution.strategy.runExecutionStep(
          this.stepRunnerService,
          {
            messageId,
            stepType: 'execution',
            attempt,
            provider: userProvider,
            model: userModel,
            temperature: executionTemperature,
            maxTokens,
            messages: executionMessages,
            onEvent,
            conversationId,
            userId,
          },
        );

        currentExecResult = executionStepResult.output;
        totalPromptTokens += executionStepResult.step.promptTokens;
        totalCompletionTokens += executionStepResult.step.completionTokens;
        totalCost += executionStepResult.step.cost;
      }

      if (await this.isMessagePaused(messageId)) {
        onEvent({
          type: 'step_complete',
          step: 'paused',
          result: 'Message paused after execution',
        });
        break;
      }

      if (!completedStepTypes.has('validation') || attempt > startAttempt) {
        const validationMessages = resolution.strategy.buildValidationMessages({
          assembledSystemPrompt: memorySystemPrompt,
          contextMessages,
          userContent,
          attempt,
          lastValidationReason,
          invariants,
          resolution,
          planResult: currentPlanResult,
          execResult: currentExecResult,
        });

        const validationStepResult = await this.stepRunnerService.runStep({
          messageId,
          stepType: 'validation',
          attempt,
          provider: validationProvider,
          model: validationModel,
          temperature: validationTemperature,
          maxTokens,
          messages: validationMessages,
          onEvent,
        });

        totalPromptTokens += validationStepResult.step.promptTokens;
        totalCompletionTokens += validationStepResult.step.completionTokens;
        totalCost += validationStepResult.step.cost;

        const validation = this.stepRunnerService.parseValidation(
          validationStepResult.output,
        );
        const finalized = resolution.strategy.finalizeValidation({
          validation,
          execResult: currentExecResult,
          planResult: currentPlanResult,
          resolution,
          userContent,
        });

        await this.stepRepository.updateStep(validationStepResult.step.id, {
          validationPassed: finalized.validation.passed,
          validationReason: finalized.validation.reason,
        });

        if (finalized.validation.injection) {
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

        if (finalized.validation.passed) {
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
            onEvent({
              type: 'error',
              error: 'Stage integrity check failed: missing completed steps',
            });
            this.logger.error(
              `Message ${messageId}: stage integrity check failed on attempt ${attempt}`,
            );
            return null;
          }

          return {
            execResult: finalized.execResult,
            totalPromptTokens,
            totalCompletionTokens,
            totalCost,
            finalAttempt: attempt,
            resolution,
            strategyDebug: finalized.debugPayload,
            contextResult,
          };
        }

        lastValidationReason = finalized.validation.reason;
        onEvent({
          type: 'step_complete',
          step: 'validation_failed',
          result: finalized.validation.reason,
        });
        this.logger.warn(
          `Message ${messageId}: validation failed attempt ${attempt}, reason: ${finalized.validation.reason}`,
        );
      }

      completedStepTypes = new Set();
      currentPlanResult = '';
      currentExecResult = '';
      currentPlanningStep = null;
      attempt++;

      if (attempt <= maxAttempts) {
        await this.messageRepository.incrementAttempt(messageId);
      }
    }

    const currentMessage = await this.messageRepository.findById(messageId);
    if (
      currentMessage &&
      currentMessage.status !== 'paused' &&
      currentMessage.status !== 'done'
    ) {
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

  private async prepareAttemptContext(params: {
    conversationId: string;
    userContent: string;
    userModel: string;
    contextLimit: number;
    memorySystemPrompt: string | undefined;
    resolution: StrategyResolution;
  }): Promise<ContextStrategyResult> {
    const systemMessages: Array<{ role: string; content: string }> = [];

    if (params.memorySystemPrompt) {
      systemMessages.push({ role: 'system', content: params.memorySystemPrompt });
    }
    if (
      params.resolution.effectiveKind === 'rag' &&
      params.resolution.ragEvidencePrompt
    ) {
      systemMessages.push({
        role: 'system',
        content: params.resolution.ragEvidencePrompt,
      });
    }

    return this.contextService.prepareContext(
      params.conversationId,
      systemMessages,
      params.userContent,
      params.userModel,
      params.contextLimit,
    );
  }

  private async loadInvariants(
    userId: string,
    projectId?: string,
  ): Promise<string[]> {
    if (!projectId) {
      return [];
    }

    const rawInvariants = await this.projectService.getInvariantsByProjectId(
      userId,
      projectId,
    );
    return this.guardService.filterInvariants(rawInvariants, projectId);
  }

  private async isMessagePaused(messageId: string): Promise<boolean> {
    const message = await this.messageRepository.findById(messageId);
    return message?.status === 'paused';
  }

  private async loadConversationDirect(
    conversationId: string,
  ): Promise<RuntimeConversationSettings | null> {
    const result = await this.db.query(
      `SELECT user_id, project_id, provider, model, temperature, max_tokens, context_limit,
              system_prompt, rag_enabled, rag_query_rewrite_enabled, rag_mode
       FROM conversations
       WHERE id = $1`,
      [conversationId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const selection = resolveStoredAISelection({ provider: row.provider, model: row.model });
    return {
      userId: row.user_id,
      projectId: row.project_id ?? null,
      provider: selection.provider,
      model: selection.model,
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

function extractStepText(step: MessageStep | null): string {
  if (!step?.outputResult) {
    return '';
  }
  if (typeof step.outputResult === 'string') {
    return step.outputResult;
  }
  if (
    step.outputResult &&
    typeof step.outputResult === 'object' &&
    'text' in step.outputResult &&
    typeof step.outputResult.text === 'string'
  ) {
    return step.outputResult.text;
  }
  return '';
}

function buildRagDebugContext(
  enabled: boolean,
  ragResult: RagContextResult,
): RagDebugContext {
  return {
    enabled,
    mode: ragResult.mode,
    scoreType: ragResult.scoreType,
    candidateCount: ragResult.candidateCount,
    matchCount: ragResult.selectedCount,
    selectedCount: ragResult.selectedCount,
    queryRewrite: ragResult.queryRewrite,
    retrievalHint: ragResult.retrievalHint,
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

function buildPipelineStrategyMetadata(
  messageId: string,
  result: RetryLoopResult,
  allSteps: MessageStep[],
) {
  const pipeline = {
    requestedStrategy: result.resolution.requestedKind,
    effectiveStrategy: result.resolution.effectiveKind,
    fallbackReason: result.resolution.fallbackReason,
    ragCandidateCount: result.resolution.ragResult.candidateCount,
    ragSelectedCount: result.resolution.ragResult.selectedCount,
  };

  return {
    messageId,
    totalAttempts: result.finalAttempt,
    totalCost: result.totalCost,
    totalTokens: result.totalPromptTokens + result.totalCompletionTokens,
    ...pipeline,
    pipeline,
    steps: allSteps.map((step) => ({
      stepType: step.stepType,
      attempt: step.attemptNumber,
      status: step.status,
      provider: step.provider,
      model: step.model,
      promptTokens: step.promptTokens,
      completionTokens: step.completionTokens,
      cost: step.cost,
      durationMs: step.durationMs,
      validationPassed: step.validationPassed,
      validationReason: step.validationReason,
    })),
    ragPipeline: result.strategyDebug,
  };
}

function getOriginalContextMessageCount(
  contextResult: ContextStrategyResult,
): number {
  const rawCount = contextResult.debugInfo?.originalMessagesCount;
  if (typeof rawCount === 'number' && Number.isFinite(rawCount)) {
    return rawCount;
  }

  return contextResult.messages?.length ?? 0;
}

function toDebugMemoryLayers(layers: MemoryLayer[]) {
  return layers
    .filter(
      (layer) =>
        layer.type === 'long_term' ||
        layer.type === 'working' ||
        layer.type === 'short_term',
    )
    .map((layer) => ({
      type: layer.type,
      label: layer.label,
      tokenCount: layer.tokenCount,
      content: layer.content,
    }));
}
