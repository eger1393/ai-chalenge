import { AppliedParams, DEFAULT_AI_PARAMS } from '@/types/ai-params';

interface AppliedParamsDisplayProps {
  appliedParams?: AppliedParams;
}

export function AppliedParamsDisplay({ appliedParams }: AppliedParamsDisplayProps) {
  if (!appliedParams) return null;

  const parts: string[] = [];

  if (appliedParams.temperature !== DEFAULT_AI_PARAMS.temperature) {
    parts.push(`temp:${appliedParams.temperature}`);
  }

  if (appliedParams.maxTokens !== DEFAULT_AI_PARAMS.maxTokens) {
    parts.push(`max:${appliedParams.maxTokens}`);
  }

  if (appliedParams.stop && appliedParams.stop.length > 0) {
    const formatted = appliedParams.stop.map((s) => `"${s}"`).join(',');
    parts.push(`stop:[${formatted}]`);
  }

  if (appliedParams.systemPrompt && appliedParams.systemPrompt.length > 0) {
    const truncated =
      appliedParams.systemPrompt.length > 40
        ? appliedParams.systemPrompt.slice(0, 40) + '...'
        : appliedParams.systemPrompt;
    parts.push(`sys:"${truncated}"`);
  }

  if (parts.length === 0) return null;

  return (
    <div className="text-xs font-mono text-gray-400 mb-1 ml-11">
      {parts.join(' | ')}
    </div>
  );
}
