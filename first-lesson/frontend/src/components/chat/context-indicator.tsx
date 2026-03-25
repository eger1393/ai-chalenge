'use client';

import { ContextWindow, ConversationTotals } from '@/types/conversation';

interface ContextIndicatorProps {
  contextWindow: ContextWindow | null;
  conversationTotals?: ConversationTotals | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function ContextIndicator({ contextWindow, conversationTotals }: ContextIndicatorProps) {
  const hasTotals = conversationTotals != null && conversationTotals.totalTokens > 0;

  if (!contextWindow && !hasTotals) return null;

  const percent = contextWindow ? Math.min(contextWindow.usagePercent, 100) : 0;

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
      {contextWindow && (
        <div className="h-1 w-full bg-gray-100">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-6">
        {/* Context percentage */}
        {contextWindow && (
          <div
            className={`text-xs text-gray-500 ${
              showLabel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } transition-opacity`}
          >
            Контекст: {Math.round(percent)}%
            <span className="text-gray-400 ml-1">
              ({formatTokens(contextWindow.usedTokens)} / {formatTokens(contextWindow.maxTokens)})
            </span>
          </div>
        )}
        {/* Conversation totals */}
        {hasTotals && (
          <div className="text-xs font-mono text-gray-400 ml-auto">
            Всего: {formatTokens(conversationTotals!.totalTokens)} tok | {formatCost(conversationTotals!.totalCost)}
          </div>
        )}
      </div>
    </div>
  );
}
