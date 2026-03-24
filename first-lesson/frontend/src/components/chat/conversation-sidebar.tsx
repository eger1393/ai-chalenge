'use client';

import { Plus, MessageSquare, Trash2, X } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { formatRelativeDate } from '@/lib/format-date';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
}: ConversationSidebarProps) {
  const sidebarContent = (
    <div className="w-72 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <span className="font-semibold text-gray-900">Диалоги</span>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Закрыть боковую панель"
        >
          <X size={20} />
        </button>
      </div>

      {/* New conversation button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-colors"
        >
          <Plus size={16} />
          Новый диалог
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            Нет диалогов
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(conv.id);
                    }
                  }}
                  className={`group relative flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-indigo-50 border-l-2 border-indigo-500'
                      : 'hover:bg-gray-100 border-l-2 border-transparent'
                  }`}
                >
                  <MessageSquare
                    size={16}
                    className={`mt-0.5 flex-shrink-0 ${
                      isActive ? 'text-indigo-600' : 'text-gray-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${
                        isActive ? 'text-indigo-900' : 'text-gray-900'
                      }`}
                    >
                      {truncate(conv.title || 'Новый диалог', 30)}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-mono">
                        {conv.model}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeDate(conv.updatedAt)}
                      </span>
                    </div>
                    {conv.lastMessage && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {truncate(conv.lastMessage.content, 40)}
                      </div>
                    )}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="absolute top-2.5 right-2 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Удалить диалог"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block flex-shrink-0">{sidebarContent}</div>

      {/* Mobile: overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
