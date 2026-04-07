'use client';

import { useState } from 'react';
import { ShieldAlert, Database, ChevronDown, ChevronRight } from 'lucide-react';
import { PipelineRunState, ToolCallData } from '@/types/pipeline';
import { PipelineStepper } from './pipeline-stepper';
import { PipelineControls } from './pipeline-controls';

const TOOL_LABELS: Record<string, string> = {
  query_database: 'SQL запрос',
  list_database_tables: 'Структура БД',
};

function ToolCallCard({ toolCall }: { toolCall: ToolCallData }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;
  const isLongResult = toolCall.result.length > 200;

  let displayArgs = toolCall.arguments;
  try {
    const parsed = JSON.parse(toolCall.arguments);
    displayArgs = parsed.sql || parsed.query || JSON.stringify(parsed, null, 2);
  } catch {
    // keep raw string
  }

  return (
    <div className="border border-blue-200 bg-blue-50/50 rounded-lg px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-blue-700 font-medium mb-1">
        <Database className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{label}</span>
      </div>

      {displayArgs && (
        <pre className="bg-white/70 border border-blue-100 rounded px-2 py-1 mb-1.5 text-[11px] text-gray-700 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-32">
          {displayArgs}
        </pre>
      )}

      {toolCall.result && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors text-[11px] mb-1"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span>Результат{isLongResult && !expanded ? ` (${toolCall.result.length} символов)` : ''}</span>
          </button>
          {expanded && (
            <pre className="bg-white/70 border border-gray-200 rounded px-2 py-1 text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
              {toolCall.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

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

          {/* Tool calls */}
          {pipelineState.toolCalls.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {pipelineState.toolCalls.map((tc, i) => (
                <ToolCallCard key={i} toolCall={tc} />
              ))}
            </div>
          )}

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

          {/* Injection message */}
          {pipelineState.injectionMessage && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
              {pipelineState.injectionMessage}
            </div>
          )}

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
