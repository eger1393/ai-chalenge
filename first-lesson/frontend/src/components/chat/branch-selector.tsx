'use client';

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { ConversationBranch } from '@/types/conversation';

interface BranchSelectorProps {
  branches: ConversationBranch[];
  activeBranchId: string | null;
  onSwitch: (branchId: string) => void;
  onCreate: () => void;
}

export function BranchSelector({ branches, activeBranchId, onSwitch, onCreate }: BranchSelectorProps) {
  if (branches.length === 0) return null;

  const currentIndex = branches.findIndex((b) => b.id === activeBranchId);
  const currentBranch = currentIndex >= 0 ? branches[currentIndex] : branches[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < branches.length - 1;

  const goToPrev = () => {
    if (hasPrev) {
      onSwitch(branches[currentIndex - 1].id);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      onSwitch(branches[currentIndex + 1].id);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 border-b border-gray-100 bg-gray-50/50">
      <button
        type="button"
        onClick={goToPrev}
        disabled={!hasPrev}
        className={`p-0.5 rounded transition-colors ${
          hasPrev ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
        }`}
        aria-label="Previous branch"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <span className="text-xs text-gray-600">
        Ветка: <span className="font-medium text-gray-900">&ldquo;{currentBranch?.name || 'main'}&rdquo;</span>
        <span className="text-[10px] text-gray-400 ml-1">
          ({currentIndex + 1}/{branches.length})
        </span>
      </span>

      <button
        type="button"
        onClick={goToNext}
        disabled={!hasNext}
        className={`p-0.5 rounded transition-colors ${
          hasNext ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
        }`}
        aria-label="Next branch"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors ml-2"
      >
        <Plus className="w-3.5 h-3.5" />
        Ветка
      </button>
    </div>
  );
}
