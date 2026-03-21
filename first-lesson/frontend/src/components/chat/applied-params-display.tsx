import { AppliedParams, DEFAULT_AI_PARAMS } from '@/types/ai-params';

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

interface AppliedParamsDisplayProps {
  appliedParams?: AppliedParams;
  cost?: number;
}

export function AppliedParamsDisplay({ appliedParams, cost }: AppliedParamsDisplayProps) {
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

  if (parts.length === 0 && !hasCost) return null;

  return (
    <div className="text-xs font-mono text-gray-400 mb-1 ml-11">
      {parts.length > 0 && parts.join(' | ')}
      {hasCost && (
        <>
          {parts.length > 0 && ' | '}
          <span className="text-emerald-600">{formatCost(cost)}</span>
        </>
      )}
    </div>
  );
}
