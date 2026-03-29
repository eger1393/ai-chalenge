'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { ConversationFact } from '@/types/conversation';

interface FactsPanelProps {
  facts: ConversationFact[];
  onAdd: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  isLoading?: boolean;
}

export function FactsPanel({ facts, onAdd, onRemove, isLoading }: FactsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    const trimmedKey = newKey.trim();
    const trimmedValue = newValue.trim();
    if (!trimmedKey || !trimmedValue) return;
    onAdd(trimmedKey, trimmedValue);
    setNewKey('');
    setNewValue('');
    setIsAdding(false);
  };

  const handleEditSave = (key: string) => {
    const trimmedValue = editValue.trim();
    if (!trimmedValue) return;
    onAdd(key, trimmedValue);
    setEditingKey(null);
    setEditValue('');
  };

  const startEdit = (fact: ConversationFact) => {
    setEditingKey(fact.key);
    setEditValue(fact.value);
  };

  return (
    <div className="mx-4 mb-2 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <span className="text-xs font-medium text-gray-700">
            Факты диалога ({facts.length})
          </span>
          {isLoading && (
            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3">
          {/* Facts table */}
          {facts.length > 0 && (
            <div className="space-y-1 mb-2">
              {facts.map((fact) => (
                <div
                  key={fact.key}
                  className="group flex items-start gap-2 text-xs py-1 border-b border-gray-100 last:border-0"
                >
                  <span className="w-1/3 font-medium text-gray-700 truncate flex-shrink-0 pt-0.5">
                    {fact.key}
                  </span>
                  {editingKey === fact.key ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(fact.key);
                          if (e.key === 'Escape') setEditingKey(null);
                        }}
                        className="flex-1 px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleEditSave(fact.key)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <span
                      className="flex-1 text-gray-600 cursor-pointer hover:text-gray-900 pt-0.5"
                      onClick={() => startEdit(fact)}
                      title="Click to edit"
                    >
                      {fact.value}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(fact.key)}
                    className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    aria-label={`Delete fact ${fact.key}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add fact form */}
          {isAdding ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Ключ"
                className="w-1/3 px-1.5 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Значение"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                  if (e.key === 'Escape') setIsAdding(false);
                }}
                className="flex-1 px-1.5 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleAdd}
                className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium px-1.5"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600 px-1"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Добавить факт
            </button>
          )}
        </div>
      )}
    </div>
  );
}
