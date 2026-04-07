'use client';

import { useState, useCallback, useRef } from 'react';
import {
  startMessages,
  resumeMessage as apiResumeMessage,
  pauseMessage as apiPauseMessage,
  cancelMessage as apiCancelMessage,
} from '@/lib/api';
import { AIParams } from '@/types/ai-params';
import { PipelineRunState, PipelineSSEEvent, PipelineStepData, PipelineStepType, PipelineStatus } from '@/types/pipeline';

const INITIAL_STATE: PipelineRunState = {
  messageId: null,
  status: 'running',
  currentStep: 'planning',
  attempt: 1,
  maxAttempts: 3,
  steps: [],
  toolCalls: [],
  totalCost: 0,
  totalTokens: 0,
};

export function usePipeline() {
  const [pipelineState, setPipelineState] = useState<PipelineRunState | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const handleEvent = useCallback((event: PipelineSSEEvent) => {
    setPipelineState((prev) => {
      if (!prev) return prev;
      switch (event.type) {
        case 'message_started':
          return { ...prev, messageId: event.messageId || null };

        case 'step_start': {
          return {
            ...prev,
            currentStep: event.step || prev.currentStep,
            attempt: event.attempt || prev.attempt,
            steps: [
              ...prev.steps,
              {
                stepType: event.step || 'execution',
                status: 'running',
                content: '',
                attempt: event.attempt,
              },
            ],
          };
        }

        case 'step_delta': {
          const steps = [...prev.steps];
          const lastIdx = steps.length - 1;
          if (lastIdx >= 0 && steps[lastIdx].stepType === event.step) {
            steps[lastIdx] = {
              ...steps[lastIdx],
              content: steps[lastIdx].content + (event.delta || ''),
            };
          }
          return { ...prev, steps };
        }

        case 'step_complete': {
          const steps = [...prev.steps];
          const lastIdx = steps.length - 1;
          if (lastIdx >= 0 && steps[lastIdx].stepType === event.step) {
            steps[lastIdx] = {
              ...steps[lastIdx],
              status: 'completed',
              content: event.result || steps[lastIdx].content,
            };
          }
          return { ...prev, steps };
        }

        case 'tool_call': {
          const toolCall = {
            name: event.name || '',
            arguments: event.arguments || '',
            result: event.result || '',
          };
          return { ...prev, toolCalls: [...prev.toolCalls, toolCall] };
        }

        case 'done':
          return {
            ...prev,
            status: 'completed',
            currentStep: 'done',
            finalContent: event.response,
          };

        case 'failed':
          return { ...prev, status: 'failed', error: event.error };

        case 'error':
          return { ...prev, status: 'failed', error: event.error };

        default:
          return prev;
      }
    });
  }, []);

  const start = useCallback(
    (message: string, conversationId: string, params?: AIParams) => {
      setPipelineState({ ...INITIAL_STATE });
      controllerRef.current?.abort();
      controllerRef.current = startMessages(conversationId, message, params, handleEvent);
    },
    [handleEvent],
  );

  const pause = useCallback(async () => {
    if (pipelineState?.messageId) {
      await apiPauseMessage(pipelineState.messageId);
      setPipelineState((prev) => (prev ? { ...prev, status: 'paused' } : prev));
    }
  }, [pipelineState?.messageId]);

  const resume = useCallback(async () => {
    if (pipelineState?.messageId) {
      controllerRef.current?.abort();
      controllerRef.current = apiResumeMessage(pipelineState.messageId, handleEvent);
      setPipelineState((prev) => (prev ? { ...prev, status: 'running' } : prev));
    }
  }, [pipelineState?.messageId, handleEvent]);

  const cancel = useCallback(async () => {
    if (pipelineState?.messageId) {
      controllerRef.current?.abort();
      await apiCancelMessage(pipelineState.messageId);
      setPipelineState((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    }
  }, [pipelineState?.messageId]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPipelineState(null);
  }, []);

  return {
    pipelineState,
    isRunning: pipelineState?.status === 'running',
    start,
    pause,
    resume,
    cancel,
    reset,
  };
}
