export type PipelineStepType = 'planning' | 'execution' | 'validation' | 'done';
export type PipelineStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface PipelineStepData {
  stepType: PipelineStepType;
  status: 'running' | 'completed' | 'failed';
  content: string;
  attempt: number;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  durationMs?: number;
  validationPassed?: boolean;
  validationReason?: string;
}

export interface PipelineRunState {
  pipelineId: string | null;
  status: PipelineStatus;
  currentStep: PipelineStepType;
  attempt: number;
  maxAttempts: number;
  steps: PipelineStepData[];
  totalCost: number;
  totalTokens: number;
  error?: string;
  finalContent?: string;
}

export type PipelineSSEEvent =
  | { type: 'pipeline_started'; pipelineId: string }
  | { type: 'step_start'; step: PipelineStepType; attempt: number; model: string }
  | { type: 'step_delta'; step: PipelineStepType; content: string }
  | { type: 'step_complete'; step: PipelineStepType; content: string; cost: number; tokens: number; durationMs: number; promptTokens: number; completionTokens: number }
  | { type: 'validation_failed'; reason: string; attempt: number }
  | { type: 'done'; content: string; pipelineId: string; attempt: number; totalCost: number; totalTokens: number; maxRetriesReached?: boolean; assistantMessageId?: string }
  | { type: 'paused'; step: PipelineStepType }
  | { type: 'resumed'; step: PipelineStepType }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export const PIPELINE_STEP_LABELS: Record<PipelineStepType, string> = {
  planning: 'Планирование',
  execution: 'Выполнение',
  validation: 'Валидация',
  done: 'Готово',
};
