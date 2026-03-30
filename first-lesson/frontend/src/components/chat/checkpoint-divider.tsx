'use client';

import { Plus, Flag } from 'lucide-react';
import { Checkpoint } from '@/types/conversation';

interface CheckpointDividerProps {
  checkpoint: Checkpoint;
  onCreateBranch: (checkpointId: string) => void;
}

export function CheckpointDivider({ checkpoint, onCreateBranch }: CheckpointDividerProps) {
  return (
    <div className="flex items-center gap-2 my-3 px-2">
      <div className="flex-1 h-px bg-indigo-200" />
      <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 font-medium px-2 py-0.5 bg-indigo-50 rounded-full border border-indigo-200">
        <Flag className="w-3 h-3" />
        <span>{checkpoint.label || 'Checkpoint'}</span>
      </div>
      <button
        type="button"
        onClick={() => onCreateBranch(checkpoint.id)}
        className="flex items-center gap-0.5 text-[10px] text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
        title="Создать ветку от этого checkpoint"
      >
        <Plus className="w-3 h-3" />
        Ветка
      </button>
      <div className="flex-1 h-px bg-indigo-200" />
    </div>
  );
}
