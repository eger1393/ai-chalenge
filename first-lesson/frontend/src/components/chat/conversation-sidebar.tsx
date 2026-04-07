'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, X, FolderPlus, FolderOpen, ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Project, ProjectInvariant } from '@/types/task';
import { formatRelativeDate } from '@/lib/format-date';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  tasks?: Project[];
  onCreateTask?: (title: string, description?: string, invariants?: string[]) => void;
  onDeleteTask?: (id: string) => void;
  onNewConversationInTask?: (projectId: string) => void;
  invariants?: ProjectInvariant[];
  onLoadInvariants?: (projectId: string) => void;
  onAddInvariant?: (content: string) => void;
  onRemoveInvariant?: (invariantId: string) => void;
  invariantsActiveTaskId?: string | null;
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
  onNewConversationInTask,
  invariants,
  onLoadInvariants,
  onAddInvariant,
  onRemoveInvariant,
  invariantsActiveTaskId,
}: ConversationSidebarProps) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskInvariants, setTaskInvariants] = useState<string[]>([]);
  const [newInvariantText, setNewInvariantText] = useState('');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ id: string; title: string } | null>(null);

  const handleDeleteTaskClick = async (task: Project) => {
    setDeleteTaskConfirm({ id: task.id, title: task.title });
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim() || !onCreateTask) return;
    onCreateTask(taskTitle.trim(), taskDesc.trim() || undefined, taskInvariants.length > 0 ? taskInvariants : undefined);
    setTaskTitle('');
    setTaskDesc('');
    setTaskInvariants([]);
    setNewInvariantText('');
    setShowTaskForm(false);
  };

  const handleAddTaskInvariant = () => {
    if (!newInvariantText.trim()) return;
    setTaskInvariants(prev => [...prev, newInvariantText.trim()]);
    setNewInvariantText('');
  };

  const handleRemoveTaskInvariant = (index: number) => {
    setTaskInvariants(prev => prev.filter((_, i) => i !== index));
  };

  // Group conversations by projectId
  const byProject = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const conv of conversations) {
      if (conv.projectId) {
        const list = map.get(conv.projectId) ?? [];
        list.push(conv);
        map.set(conv.projectId, list);
      }
    }
    return map;
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
        <MessageSquare
          size={16}
          className={`mt-0.5 flex-shrink-0 ${
            isActive ? 'text-indigo-600' : 'text-gray-400'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div
              className={`text-sm font-medium truncate ${
                isActive ? 'text-indigo-900' : 'text-gray-900'
              }`}
            >
              {truncate(conv.title || 'Новый диалог', 30)}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-mono">
              {conv.model}
            </span>
            <span className="text-xs text-gray-400">
              {formatRelativeDate(conv.updatedAt)}
            </span>
          </div>
          {conv.lastMessage ? (
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

      {/* New conversation + project buttons */}
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
              Проект
            </button>
          )}
        </div>
      </div>

      {/* Project creation form */}
      {showTaskForm && (
        <div className="mx-3 mb-3 p-3 border border-indigo-200 rounded-lg bg-indigo-50/50 space-y-2">
          <input
            type="text"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleCreateTask()}
            placeholder="Название проекта..."
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autoFocus
          />
          <textarea
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
            placeholder="Описание проекта (стек, ограничения, контекст...)"
            rows={3}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {/* Invariants in creation form */}
          <div className="p-2 bg-red-50 border border-red-200 rounded-md space-y-1.5">
            <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1">
              <Shield size={10} />
              Инварианты
            </div>
            {taskInvariants.map((inv, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700 bg-white rounded px-2 py-1 border border-red-100">
                <span className="flex-1">{inv}</span>
                <button onClick={() => handleRemoveTaskInvariant(i)} className="text-red-300 hover:text-red-600 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex gap-1">
              <input
                value={newInvariantText}
                onChange={e => setNewInvariantText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTaskInvariant())}
                placeholder="Правило, которое нельзя нарушать..."
                className="flex-1 px-2 py-1 text-[11px] border border-red-200 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <button
                onClick={handleAddTaskInvariant}
                disabled={!newInvariantText.trim()}
                className="px-2 py-1 bg-red-600 text-white text-[10px] rounded hover:bg-red-700 disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
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

      {/* Conversation list grouped by projects */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {tasks.length === 0 && conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            Нет проектов
          </div>
        ) : (
          <div className="space-y-1">
            {/* Projects with their conversations */}
            {tasks.map(project => {
              const projectConvs = byProject.get(project.id) ?? [];
              const isExpanded = expandedTasks.has(project.id);
              return (
                <div key={project.id} className="mb-1">
                  <div className="group flex items-center">
                    <button
                      onClick={() => setExpandedTasks(prev => {
                        const next = new Set(prev);
                        isExpanded ? next.delete(project.id) : next.add(project.id);
                        return next;
                      })}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                      <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 truncate flex-1">{project.title}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{projectConvs.length}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTaskClick(project); }}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all mr-1"
                      aria-label="Удалить проект"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {isExpanded && (
                    <>
                      <InvariantsSection
                        taskId={project.id}
                        invariants={invariantsActiveTaskId === project.id ? (invariants || []) : []}
                        onLoad={onLoadInvariants}
                        onAdd={onAddInvariant}
                        onRemove={onRemoveInvariant}
                      />
                      <div className="pl-4 space-y-0.5">
                        {projectConvs.map(conv => renderConversationItem(conv))}
                        {onNewConversationInTask && (
                          <button
                            onClick={() => onNewConversationInTask(project.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Plus size={12} />
                            Новый диалог в проекте
                          </button>
                        )}
                      </div>
                    </>
                  )}
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

      {/* Delete project confirmation modal */}
      {deleteTaskConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg p-5 max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Удалить проект?</h3>
            <p className="text-xs text-gray-600 mb-4">
              Проект &ldquo;<span className="font-medium">{deleteTaskConfirm.title}</span>&rdquo; и все его диалоги будут удалены навсегда.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTaskConfirm(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                Отмена
              </button>
              <button
                onClick={async () => {
                  if (onDeleteTask) await onDeleteTask(deleteTaskConfirm.id);
                  setDeleteTaskConfirm(null);
                }}
                className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InvariantsSection({ taskId, invariants, onLoad, onAdd, onRemove }: {
  taskId: string;
  invariants: ProjectInvariant[];
  onLoad?: (projectId: string) => void;
  onAdd?: (content: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && onLoad) {
      onLoad(taskId);
      setLoaded(true);
    }
  }, [taskId, loaded, onLoad]);

  const handleAdd = () => {
    if (!text.trim() || !onAdd) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div className="mx-3 mb-2">
      <button
        onClick={() => setShowForm(v => !v)}
        className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-medium mb-1"
      >
        <Shield className="w-3 h-3" />
        Инварианты ({invariants.length})
      </button>
      {showForm && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md space-y-1.5">
          {invariants.map(inv => (
            <div key={inv.id} className="flex items-start gap-1.5 text-[11px] text-red-700 bg-white rounded px-2 py-1 border border-red-100">
              <span className="flex-1">{inv.content}</span>
              <button onClick={() => onRemove?.(inv.id)} className="text-red-300 hover:text-red-600 flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Новое правило..."
              className="flex-1 px-2 py-1 text-[11px] border border-red-200 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <button
              onClick={handleAdd}
              disabled={!text.trim()}
              className="px-2 py-1 bg-red-600 text-white text-[10px] rounded hover:bg-red-700 disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
