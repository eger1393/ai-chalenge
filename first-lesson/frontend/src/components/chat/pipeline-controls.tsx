'use client';

import { Pause, Play, X } from 'lucide-react';
import { PipelineStatus } from '@/types/pipeline';

interface PipelineControlsProps {
  status: PipelineStatus;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function PipelineControls({ status, onPause, onResume, onCancel }: PipelineControlsProps) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-lg">
        Завершено
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded-lg">
        Ошибка
      </span>
    );
  }

  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-lg">
        Отменено
      </span>
    );
  }

  if (status === 'paused') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onResume}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <Play className="w-3 h-3" />
          Продолжить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-3 h-3" />
          Отмена
        </button>
      </div>
    );
  }

  // running
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPause}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
      >
        <Pause className="w-3 h-3" />
        Пауза
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <X className="w-3 h-3" />
        Отмена
      </button>
    </div>
  );
}
