'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { ConversationBranch, Checkpoint } from '@/types/conversation';

interface BranchSelectorProps {
  branches: ConversationBranch[];
  checkpoints: Checkpoint[];
  activeBranchId: string | null;
  onSwitch: (branchId: string) => void;
  onCreateBranch: (checkpointId: string, name: string) => void;
  onDeleteBranch: (branchId: string) => void;
}

export function BranchSelector({
  branches,
  checkpoints,
  activeBranchId,
  onSwitch,
  onCreateBranch,
  onDeleteBranch,
}: BranchSelectorProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState('');

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

  const handleCreate = () => {
    if (!selectedCheckpointId || !newBranchName.trim()) return;
    onCreateBranch(selectedCheckpointId, newBranchName.trim());
    setShowCreateDialog(false);
    setNewBranchName('');
    setSelectedCheckpointId('');
  };

  const handleOpenCreate = () => {
    if (checkpoints.length > 0) {
      setSelectedCheckpointId(checkpoints[checkpoints.length - 1].id);
    }
    setNewBranchName(`Branch ${branches.length + 1}`);
    setShowCreateDialog(true);
  };

  return (
    <div className="px-4 py-1.5 border-b border-gray-100 bg-gray-50/50">
      <div className="flex items-center justify-center gap-3">
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
            ({currentIndex + 1}/{branches.length}
            {currentBranch?.messageCount != null ? `, ${currentBranch.messageCount} msg` : ''})
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
          onClick={handleOpenCreate}
          disabled={checkpoints.length === 0}
          className={`flex items-center gap-1 text-xs transition-colors ml-2 ${
            checkpoints.length === 0
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-indigo-600 hover:text-indigo-700'
          }`}
          title={checkpoints.length === 0 ? 'Сначала создайте checkpoint' : 'Создать новую ветку'}
        >
          <Plus className="w-3.5 h-3.5" />
          Ветка
        </button>

        {currentBranch && currentBranch.name !== 'main' && (
          <button
            type="button"
            onClick={() => onDeleteBranch(currentBranch.id)}
            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-600 transition-colors ml-1"
            title="Удалить ветку"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Create branch dialog */}
      {showCreateDialog && (
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">Новая ветка</span>
            <button
              type="button"
              onClick={() => setShowCreateDialog(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="Название ветки"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            {checkpoints.length > 1 && (
              <select
                value={selectedCheckpointId}
                onChange={(e) => setSelectedCheckpointId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {checkpoints.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.label || `Checkpoint ${cp.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newBranchName.trim() || !selectedCheckpointId}
              className="w-full text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Создать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
