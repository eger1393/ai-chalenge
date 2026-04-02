'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { PipelineStepData, PipelineStepType, PIPELINE_STEP_LABELS } from '@/types/pipeline';

interface PipelineAccordionProps {
  steps: PipelineStepData[];
  currentStep: PipelineStepType;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cost?: number): string {
  if (!cost) return '';
  return `$${cost.toFixed(4)}`;
}

export function PipelineAccordion({ steps, currentStep }: PipelineAccordionProps) {
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());

  // Auto-open running step
  useEffect(() => {
    const runningIdx = steps.findIndex((s) => s.status === 'running');
    if (runningIdx >= 0) {
      setOpenSteps((prev) => {
        const next = new Set(prev);
        next.add(runningIdx);
        return next;
      });
    }
  }, [steps]);

  const toggle = (index: number) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (steps.length === 0) return null;

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const isOpen = openSteps.has(index) || step.status === 'running';
        const isRunning = step.status === 'running';

        return (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header */}
            <button
              type="button"
              onClick={() => toggle(index)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              {/* Status icon */}
              {isRunning && (
                <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin flex-shrink-0" />
              )}
              {step.status === 'completed' && (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              )}
              {step.status === 'failed' && (
                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              )}

              {/* Step name */}
              <span className="text-xs font-medium text-gray-700 flex-1">
                {PIPELINE_STEP_LABELS[step.stepType]}
              </span>

              {/* Attempt */}
              {step.attempt > 1 && (
                <span className="text-[10px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded">
                  #{step.attempt}
                </span>
              )}

              {/* Validation badge */}
              {step.stepType === 'validation' && step.status === 'completed' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                  PASS
                </span>
              )}
              {step.stepType === 'validation' && step.status === 'failed' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                  FAIL
                </span>
              )}

              {/* Cost */}
              {step.cost !== undefined && step.cost > 0 && (
                <span className="text-[10px] text-gray-400">{formatCost(step.cost)}</span>
              )}

              {/* Duration */}
              {step.durationMs !== undefined && step.durationMs > 0 && (
                <span className="text-[10px] text-gray-400">{formatDuration(step.durationMs)}</span>
              )}

              {/* Chevron */}
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Content */}
            {isOpen && (
              <div className="px-3 pb-3 border-t border-gray-100">
                {step.validationReason && (
                  <div className="mt-2 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {step.validationReason}
                  </div>
                )}
                {step.content && (
                  <div className="mt-2 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {step.content}
                    {isRunning && (
                      <span className="inline-block w-1.5 h-3.5 bg-indigo-600 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                    )}
                  </div>
                )}
                {!step.content && isRunning && (
                  <div className="mt-2 text-xs text-gray-400 italic">
                    Обработка...
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
