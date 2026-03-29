'use client';

import { Square } from 'lucide-react';

interface TestProgressBarProps {
  current: number;
  total: number;
  onAbort: () => void;
}

export function TestProgressBar({ current, total, onAbort }: TestProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-600">
          Генерация: <span className="font-mono font-medium">{current}/{total}</span> пар
        </span>
        <button
          onClick={onAbort}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
        >
          <Square className="w-3 h-3" />
          Остановить
        </button>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
