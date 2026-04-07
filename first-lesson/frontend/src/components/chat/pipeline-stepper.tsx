'use client';

import { CheckCircle, XCircle, Circle, ShieldAlert } from 'lucide-react';
import { PipelineStepType, PipelineStepData, PipelineStatus, PIPELINE_STEP_LABELS } from '@/types/pipeline';

const STEPS: PipelineStepType[] = ['planning', 'execution', 'validation', 'done'];

interface PipelineStepperProps {
  currentStep: PipelineStepType | string;
  status: PipelineStatus;
  attempt: number;
  maxAttempts: number;
  steps: PipelineStepData[];
}

export function PipelineStepper({ currentStep, status, attempt, maxAttempts, steps }: PipelineStepperProps) {
  const currentStepIndex = STEPS.indexOf(currentStep as PipelineStepType);

  function getStepState(step: PipelineStepType, index: number) {
    // Find the latest step data for this step type
    const stepData = [...steps].reverse().find((s) => s.stepType === step);

    if (status === 'injection_blocked') return 'injection';
    if (step === currentStep && status === 'running') return 'active';
    if (step === currentStep && status === 'paused') return 'active';
    if (stepData?.status === 'completed') return 'completed';
    if (stepData?.status === 'failed') return 'failed';
    if (index < currentStepIndex) return 'completed';
    return 'pending';
  }

  return (
    <div className="flex items-center gap-1 w-full">
      {STEPS.map((step, index) => {
        const state = getStepState(step, index);
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              {/* Icon */}
              <div className="flex items-center justify-center">
                {state === 'completed' && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                {state === 'failed' && (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                {state === 'active' && (
                  <div className="relative flex items-center justify-center">
                    <span className="absolute inline-flex w-5 h-5 rounded-full bg-indigo-400 opacity-40 animate-ping" />
                    <span className="relative w-5 h-5 rounded-full bg-indigo-600 border-2 border-white" />
                  </div>
                )}
                {state === 'pending' && (
                  <Circle className="w-5 h-5 text-gray-300" />
                )}
                {state === 'injection' && (
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                )}
              </div>
              {/* Label */}
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  state === 'injection'
                    ? 'text-amber-600'
                    : state === 'active'
                      ? 'text-indigo-600'
                      : state === 'completed'
                        ? 'text-green-600'
                        : state === 'failed'
                          ? 'text-red-600'
                          : 'text-gray-400'
                }`}
              >
                {PIPELINE_STEP_LABELS[step]}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={`flex-1 h-0.5 mx-1.5 rounded ${
                  index < currentStepIndex ? 'bg-green-400' : 'bg-gray-200'
                }`}
                style={{ marginTop: '-14px' }}
              />
            )}
          </div>
        );
      })}

      {/* Attempt badge */}
      {attempt > 1 && (
        <div className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">
          {attempt}/{maxAttempts}
        </div>
      )}
    </div>
  );
}
