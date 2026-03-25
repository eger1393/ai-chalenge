import { AppliedParams, DEFAULT_AI_PARAMS, Usage } from '@/types/ai-params';

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface AppliedParamsDisplayProps {
  appliedParams?: AppliedParams;
  cost?: number;
  usage?: Usage;
  durationMs?: number;
}

export function AppliedParamsDisplay({ appliedParams, cost, usage, durationMs }: AppliedParamsDisplayProps) {
  const parts: string[] = [];

  if (appliedParams) {
    if (appliedParams.model && appliedParams.model !== DEFAULT_AI_PARAMS.model) {
      parts.push(`model:${appliedParams.model}`);
    }

    if (appliedParams.temperature !== DEFAULT_AI_PARAMS.temperature) {
      parts.push(`temp:${appliedParams.temperature}`);
    }

    if (appliedParams.maxTokens !== DEFAULT_AI_PARAMS.maxTokens) {
      parts.push(`max:${appliedParams.maxTokens}`);
    }

    if (appliedParams.repetitionPenalty !== undefined && appliedParams.repetitionPenalty !== DEFAULT_AI_PARAMS.repetitionPenalty) {
      parts.push(`rep:${appliedParams.repetitionPenalty}`);
    }

    if (appliedParams.systemPrompt && appliedParams.systemPrompt.length > 0) {
      const truncated =
        appliedParams.systemPrompt.length > 40
          ? appliedParams.systemPrompt.slice(0, 40) + '...'
          : appliedParams.systemPrompt;
      parts.push(`sys:"${truncated}"`);
    }
  }

  const hasCost = cost != null && cost > 0;
  const hasUsage = usage != null && usage.totalTokens > 0;
  const hasDuration = durationMs != null && durationMs > 0;

  if (parts.length === 0 && !hasCost && !hasUsage && !hasDuration) return null;

  return (
    <div className="text-xs font-mono text-gray-400 mb-1 ml-11 flex flex-wrap gap-x-1 items-center">
      {parts.length > 0 && <span>{parts.join(' | ')}</span>}
      {hasUsage && (
        <>
          {parts.length > 0 && <span>|</span>}
          <span className="text-sky-500">{usage!.totalTokens} tok</span>
          {usage!.currentMessageTokens != null ? (
            <span className="text-gray-300 text-[10px]">
              (запрос:{usage!.currentMessageTokens} история:{usage!.historyTokens} ответ:{usage!.completionTokens})
            </span>
          ) : (
            <span className="text-gray-300 text-[10px]">({usage!.promptTokens}↑ {usage!.completionTokens}↓)</span>
          )}
        </>
      )}
      {hasDuration && (
        <>
          <span>|</span>
          <span className="text-amber-500">{formatDuration(durationMs!)}</span>
        </>
      )}
      {hasCost && (
        <>
          <span>|</span>
          <span className="text-emerald-600">{formatCost(cost!)}</span>
        </>
      )}
    </div>
  );
}
