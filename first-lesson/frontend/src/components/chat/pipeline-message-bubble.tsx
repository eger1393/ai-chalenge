'use client';

import { PipelineRunState } from '@/types/pipeline';
import { PipelineStepper } from './pipeline-stepper';
import { PipelineAccordion } from './pipeline-accordion';
import { PipelineControls } from './pipeline-controls';

interface PipelineMessageBubbleProps {
  pipelineState: PipelineRunState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function PipelineMessageBubble({ pipelineState, onPause, onResume, onCancel }: PipelineMessageBubbleProps) {
  const { status, currentStep, attempt, maxAttempts, steps, totalCost, totalTokens } = pipelineState;

  // If completed, show the last execution result as main text
  const isCompleted = status === 'completed';
  const lastExecStep = isCompleted
    ? [...steps].reverse().find((s) => s.stepType === 'execution' && s.status === 'completed')
    : null;

  return (
    <div className="mb-4">
      <div className="flex items-start gap-3">
        {/* AI avatar */}
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          {/* Stepper */}
          <div className="mb-3">
            <PipelineStepper
              currentStep={currentStep}
              status={status}
              attempt={attempt}
              maxAttempts={maxAttempts}
              steps={steps}
            />
          </div>

          {/* Controls */}
          <div className="mb-3">
            <PipelineControls
              status={status}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
            />
          </div>

          {/* If completed, show final text */}
          {isCompleted && lastExecStep && (
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap bg-gray-100 text-gray-800 mb-3">
              {lastExecStep.content}
            </div>
          )}

          {/* Error */}
          {pipelineState.error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              {pipelineState.error}
            </div>
          )}

          {/* Accordion with step details */}
          <PipelineAccordion steps={steps} currentStep={currentStep} />

          {/* Totals */}
          {(totalCost > 0 || totalTokens > 0) && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
              {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
              {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tok</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
