import { RagContextResult } from '../../../rag/rag.types';
import { MessageStep } from '../../repositories/step.repository';
import { StepRunnerService, ValidationResult } from '../step-runner.service';

export type ProcessingStrategyKind = 'standard' | 'rag';
export type StrategyFallbackReason = 'empty_retrieval' | null;

export interface StrategyResolution {
  requestedKind: ProcessingStrategyKind;
  effectiveKind: ProcessingStrategyKind;
  fallbackReason: StrategyFallbackReason;
  ragResult: RagContextResult;
  ragEvidencePrompt?: string;
  strategy: MessageProcessingStrategy;
}

export interface StrategyMessageParams {
  assembledSystemPrompt: string | undefined;
  contextMessages: Array<{ role: string; content: string }>;
  userContent: string;
  attempt: number;
  lastValidationReason: string;
  invariants: string[];
  resolution: StrategyResolution;
}

export interface StrategyExecutionMessageParams extends StrategyMessageParams {
  planResult: string;
}

export interface StrategyValidationMessageParams extends StrategyMessageParams {
  planResult: string;
  execResult: string;
}

export interface StrategyExecutionStepParams {
  messageId: string;
  stepType: 'execution';
  attempt: number;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onEvent: (event: Record<string, unknown>) => void;
  conversationId?: string;
  userId?: string;
}

export interface NormalizedPlanningResult {
  planResult: string;
  stepOutputOverride?: unknown;
}

export interface FinalizedValidationResult {
  validation: ValidationResult;
  execResult: string;
  debugPayload: Record<string, unknown> | null;
}

export interface MessageProcessingStrategy {
  readonly kind: ProcessingStrategyKind;

  canParsePlanningResult(planResult: string): boolean;

  buildPlanningMessages(params: StrategyMessageParams): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  normalizePlanningResult(
    rawPlanResult: string,
    resolution: StrategyResolution,
    userContent: string,
  ): NormalizedPlanningResult;

  buildExecutionMessages(params: StrategyExecutionMessageParams): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  runExecutionStep(
    stepRunnerService: StepRunnerService,
    params: StrategyExecutionStepParams,
  ): Promise<{ output: string; step: MessageStep }>;

  buildValidationMessages(params: StrategyValidationMessageParams): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;

  finalizeValidation(params: {
    validation: ValidationResult;
    execResult: string;
    planResult: string;
    resolution: StrategyResolution;
    userContent: string;
  }): FinalizedValidationResult;
}
