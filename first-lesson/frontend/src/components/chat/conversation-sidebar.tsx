'use client';

import { useState, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, X, FlaskConical, FolderPlus, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Task } from '@/types/task';
import { formatRelativeDate } from '@/lib/format-date';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  tasks?: Task[];
  onCreateTask?: (title: string, description?: string) => void;
  onDeleteTask?: (id: string) => void;
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
  tasks = [],
  onCreateTask,
  onDeleteTask,
}: ConversationSidebarProps) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const handleCreateTask = () => {
    if (!taskTitle.trim() || !onCreateTask) return;
    onCreateTask(taskTitle.trim(), taskDesc.trim() || undefined);
    setTaskTitle('');
    setTaskDesc('');
    setShowTaskForm(false);
  };

  const { byTask, orphans } = useMemo(() => {
    const byTask = new Map<string, Conversation[]>();
    const orphans: Conversation[] = [];
    for (const conv of conversations) {
      if (conv.taskId) {
        const list = byTask.get(conv.taskId) ?? [];
        list.push(conv);
        byTask.set(conv.taskId, list);
      } else {
        orphans.push(conv);
      }
    }
    return { byTask, orphans };
  }, [conversations]);

  const renderConversationItem = (conv: Conversation) => {
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
        {conv.isTest ? (
          <FlaskConical
            size={16}
            className={`mt-0.5 flex-shrink-0 ${
              isActive ? 'text-amber-600' : 'text-amber-400'
            }`}
          />
        ) : (
          <MessageSquare
            size={16}
            className={`mt-0.5 flex-shrink-0 ${
              isActive ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={`text-sm font-medium truncate ${
                isActive ? 'text-indigo-900' : 'text-gray-900'
              }`}
            >
              {truncate(conv.title || 'Новый диалог', 30)}
            </div>
            {conv.isTest && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium flex-shrink-0">
                TEST
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-mono">
              {conv.model}
            </span>
            {conv.contextStrategy && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">
                {conv.contextStrategy === 'sliding_window' ? 'SW' : conv.contextStrategy === 'sticky_facts' ? 'SF' : conv.contextStrategy === 'branching' ? 'BR' : ''}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {formatRelativeDate(conv.updatedAt)}
            </span>
          </div>
          {conv.isTest && conv.testTopic ? (
            <div className="text-xs text-amber-600 mt-0.5 truncate">
              {truncate(conv.testTopic, 40)}
            </div>
          ) : conv.lastMessage ? (
            <div className="text-xs text-gray-400 mt-0.5 truncate">
              {truncate(conv.lastMessage.content, 40)}
            </div>
          ) : null}
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
  };

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

      {/* New conversation + task buttons */}
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={onNew}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-colors"
          >
            <Plus size={16} />
            Новый диалог
          </button>
          {onCreateTask && (
            <button
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-300 bg-indigo-50 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <FolderPlus size={14} />
              Задача
            </button>
          )}
        </div>
      </div>

      {/* Task creation form */}
      {showTaskForm && (
        <div className="mx-3 mb-3 p-3 border border-indigo-200 rounded-lg bg-indigo-50/50 space-y-2">
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCreateTask()}
            placeholder="Название задачи..."
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autoFocus
          />
          <textarea
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            placeholder="Описание задачи (стек, ограничения, контекст...)"
            rows={3}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateTask}
              disabled={!taskTitle.trim()}
              className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Создать
            </button>
            <button
              onClick={() => { setShowTaskForm(false); setTaskTitle(''); setTaskDesc(''); }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Conversation list grouped by tasks */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            Нет диалогов
          </div>
        ) : (
          <div className="space-y-1">
            {/* Tasks with their conversations */}
            {tasks.map(task => {
              const taskConvs = byTask.get(task.id) ?? [];
              const isExpanded = expandedTasks.has(task.id);
              return (
                <div key={task.id} className="mb-1">
                  <button
                    onClick={() => setExpandedTasks(prev => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(task.id) : next.add(task.id);
                      return next;
                    })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                    <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate flex-1">{task.title}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{taskConvs.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="pl-4">
                      {taskConvs.map(conv => renderConversationItem(conv))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Orphan conversations (no task) */}
            {orphans.length > 0 && (
              <div className={tasks.length > 0 ? 'mt-2 pt-2 border-t border-gray-200' : ''}>
                {tasks.length > 0 && (
                  <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                    Без задачи
                  </div>
                )}
                {orphans.map(conv => renderConversationItem(conv))}
              </div>
            )}
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
