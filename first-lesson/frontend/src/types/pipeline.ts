export type PipelineStepType = 'planning' | 'execution' | 'validation' | 'done';
export type PipelineStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'injection_blocked';

export type PipelineSSEEventType =
  | 'message_started'
  | 'step_start'
  | 'step_delta'
  | 'step_complete'
  | 'tool_call'
  | 'done'
  | 'failed'
  | 'error';

export interface PipelineSSEEvent {
  type: PipelineSSEEventType;
  messageId?: string;
  step?: string;
  attempt?: number;
  delta?: string;
  result?: string;
  response?: string;
  meta?: any;
  error?: string;
  name?: string;
  arguments?: string;
}

export interface ToolCallData {
  name: string;
  arguments: string;
  result: string;
}

export const PIPELINE_STEP_LABELS: Record<PipelineStepType, string> = {
  planning: 'Планирование',
  execution: 'Выполнение',
  validation: 'Валидация',
  done: 'Готово',
};

export interface PipelineStepData {
  stepType: PipelineStepType | string;
  status: 'running' | 'completed' | 'failed';
  content: string;
  attempt?: number;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  durationMs?: number;
  validationPassed?: boolean;
  validationReason?: string;
}

export interface PipelineRunState {
  messageId: string | null;
  status: PipelineStatus;
  currentStep: PipelineStepType | string;
  attempt: number;
  maxAttempts: number;
  steps: PipelineStepData[];
  toolCalls: ToolCallData[];
  totalCost: number;
  totalTokens: number;
  finalContent?: string;
  error?: string;
  injectionMessage?: string;
}
