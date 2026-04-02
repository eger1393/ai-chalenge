'use client';

import { useState, useCallback, useRef } from 'react';
import {
  startPipeline as apiStartPipeline,
  resumePipeline as apiResumePipeline,
  pausePipeline as apiPausePipeline,
  cancelPipeline as apiCancelPipeline,
} from '@/lib/api';
import { AIParams } from '@/types/ai-params';
import { PipelineRunState, PipelineSSEEvent } from '@/types/pipeline';

const INITIAL_STATE: PipelineRunState = {
  pipelineId: null,
  status: 'running',
  currentStep: 'planning',
  attempt: 1,
  maxAttempts: 3,
  steps: [],
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
        case 'pipeline_started':
          return { ...prev, pipelineId: event.pipelineId };

        case 'step_start': {
          return {
            ...prev,
            currentStep: event.step,
            attempt: event.attempt,
            steps: [
              ...prev.steps,
              {
                stepType: event.step,
                status: 'running',
                content: '',
                attempt: event.attempt,
                model: event.model,
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
              content: steps[lastIdx].content + event.content,
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
              content: event.content,
              cost: event.cost,
              durationMs: event.durationMs,
              promptTokens: event.promptTokens,
              completionTokens: event.completionTokens,
            };
          }
          return {
            ...prev,
            steps,
            totalCost: prev.totalCost + (event.cost || 0),
            totalTokens: prev.totalTokens + (event.tokens || 0),
          };
        }

        case 'validation_failed': {
          const steps = [...prev.steps];
          const lastIdx = steps.length - 1;
          if (lastIdx >= 0) {
            steps[lastIdx] = {
              ...steps[lastIdx],
              status: 'failed',
              validationPassed: false,
              validationReason: event.reason,
            };
          }
          return { ...prev, steps, attempt: event.attempt };
        }

        case 'done':
          return {
            ...prev,
            status: 'completed',
            currentStep: 'done',
            totalCost: event.totalCost,
            totalTokens: event.totalTokens,
          };

        case 'paused':
          return { ...prev, status: 'paused' };

        case 'resumed':
          return { ...prev, status: 'running' };

        case 'cancelled':
          return { ...prev, status: 'cancelled' };

        case 'error':
          return { ...prev, status: 'failed', error: event.message };

        default:
          return prev;
      }
    });
  }, []);

  const start = useCallback(
    (message: string, conversationId: string, params?: AIParams) => {
      setPipelineState({ ...INITIAL_STATE });
      controllerRef.current?.abort();
      controllerRef.current = apiStartPipeline(message, conversationId, params, handleEvent);
    },
    [handleEvent],
  );

  const pause = useCallback(async () => {
    if (pipelineState?.pipelineId) {
      await apiPausePipeline(pipelineState.pipelineId);
    }
  }, [pipelineState?.pipelineId]);

  const resume = useCallback(async () => {
    if (pipelineState?.pipelineId) {
      controllerRef.current?.abort();
      controllerRef.current = apiResumePipeline(pipelineState.pipelineId, handleEvent);
      setPipelineState((prev) => (prev ? { ...prev, status: 'running' } : prev));
    }
  }, [pipelineState?.pipelineId, handleEvent]);

  const cancel = useCallback(async () => {
    if (pipelineState?.pipelineId) {
      controllerRef.current?.abort();
      await apiCancelPipeline(pipelineState.pipelineId);
      setPipelineState((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
    }
  }, [pipelineState?.pipelineId]);

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
