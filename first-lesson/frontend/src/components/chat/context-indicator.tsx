'use client';

import { ContextWindow } from '@/types/conversation';

interface ContextIndicatorProps {
  contextWindow: ContextWindow | null;
}

export function ContextIndicator({ contextWindow }: ContextIndicatorProps) {
  if (!contextWindow) return null;

  const percent = Math.min(contextWindow.usagePercent, 100);

  let barColor: string;
  if (percent > 85) {
    barColor = 'bg-red-500';
  } else if (percent > 60) {
    barColor = 'bg-amber-500';
  } else {
    barColor = 'bg-green-500';
  }

  const showLabel = percent > 70;

  return (
    <div className="relative group flex-shrink-0">
      <div className="h-1 w-full bg-gray-100">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {/* Always visible when > 70%, otherwise on hover */}
      <div
        className={`absolute top-1 right-2 text-xs px-1.5 py-0.5 rounded bg-white/90 border border-gray-200 shadow-sm text-gray-600 ${
          showLabel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } transition-opacity`}
      >
        Контекст: {Math.round(percent)}%
      </div>
    </div>
  );
}
