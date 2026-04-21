'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, FolderOpen, Brain, Shield } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useChat, Message } from '@/hooks/use-chat';
import { useAIParams } from '@/hooks/use-ai-params';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useConversations } from '@/hooks/use-conversations';
import { usePipeline } from '@/hooks/use-pipeline';
import { useFacts } from '@/hooks/use-facts';
import { useTasks } from '@/hooks/use-tasks';
import { useInvariants } from '@/hooks/use-invariants';
import { useNotificationContext } from '@/context/notification-context';
import { addProjectInvariant, updateConversationContext } from '@/lib/api';
import { IssueNotification } from '@/types/notification';
import type { AIParams, ContextStrategyType } from '@/types/ai-params';
import { ConversationSidebar } from './conversation-sidebar';
import { ContextIndicator } from './context-indicator';
import { SubscriptionIndicator } from './subscription-indicator';
import { FactsPanel } from './facts-panel';
import { MessageBubble } from './message-bubble';
import { NotificationBubble } from './notification-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';
import { AIParamsPanel } from './ai-params-panel';
import { PipelineMessageBubble } from './pipeline-message-bubble';

export function ChatLayout() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const conversations = useConversations();
  const chat = useChat();
  const {
    params,
    setParam,
    resetParams,
    hasNonDefaults,
    hydrateConversationParams,
    restoreStoredParams,
  } = useAIParams();
  const pipeline = usePipeline();
  const facts = useFacts(chat.conversationId);
  const { tasks, addTask, removeTask } = useTasks();
  const invariantsHook = useInvariants();
  const { notifications, subscriptions, loadNotifications, loadSubscriptions, markRead } = useNotificationContext();
  const [showParams, setShowParams] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationStrategy, setConversationStrategy] = useState<string | undefined>(undefined);
  const [isContextStrategyLocked, setIsContextStrategyLocked] = useState(false);
  const scrollRef = useAutoScroll(chat.messages);

  // Track previous activeId to avoid re-loading the same conversation
  const prevActiveIdRef = useRef<string | null | undefined>(undefined);

  // Determine current strategy: conversation's fixed strategy or params strategy
  const currentStrategy = conversationStrategy || params.contextStrategy;

  // Active conversation & project for header badge
  const activeConversation = conversations.conversations.find(c => c.id === conversations.activeId);
  const activeProject = tasks.find(t => t.id === activeConversation?.projectId);

  // Load all conversations when tasks change
  useEffect(() => {
    if (tasks.length > 0) {
      conversations.loadAll(tasks.map(t => t.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    const activeId = conversations.activeId;
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;

    if (activeId) {
      chat.loadConversation(activeId).then((detail) => {
        setConversationStrategy(detail?.contextStrategy || undefined);
        setIsContextStrategyLocked((detail?.messages.length ?? 0) > 0);
        if (detail) {
          hydrateConversationParams({
            provider: detail.provider as AIParams['provider'],
            model: detail.model,
            temperature: detail.temperature,
            maxTokens: detail.maxTokens,
            repetitionPenalty: detail.repetitionPenalty,
            systemPrompt: detail.systemPrompt || '',
            contextLimit: detail.contextLimit,
            ragEnabled: detail.ragEnabled,
            ragQueryRewriteEnabled: detail.ragQueryRewriteEnabled,
            ragMode: detail.ragMode,
            contextStrategy: (detail.contextStrategy as ContextStrategyType) || params.contextStrategy,
          });
        }
        const resolvedStrategy = detail?.contextStrategy || params.contextStrategy;
        if (resolvedStrategy === 'sticky_facts') {
          facts.loadFacts(activeId);
        }

        // Load invariants for active project
        const projectId = detail?.projectId || conversations.conversations.find(c => c.id === activeId)?.projectId;
        if (projectId) {
          invariantsHook.load(projectId);
        } else {
          invariantsHook.reset();
        }
      });
    } else {
      chat.startNew();
      setConversationStrategy(undefined);
      setIsContextStrategyLocked(false);
      restoreStoredParams();
      pipeline.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeId]);

  // Load subscriptions & notifications when conversation changes
  useEffect(() => {
    if (conversations.activeId) {
      loadSubscriptions(conversations.activeId);
      loadNotifications(conversations.activeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeId]);

  // Build merged timeline: messages in order, notifications sorted by createdAt
  type TimelineItem =
    | { kind: 'message'; data: Message; order: number }
    | { kind: 'notification'; data: IssueNotification; order: number };

  const timeline = useMemo<TimelineItem[]>(() => {
    // Messages keep their original array order
    const items: TimelineItem[] = chat.messages.map((m, i) => ({
      kind: 'message' as const,
      data: m,
      order: i,
    }));
    // Notifications sorted by createdAt, placed after all messages
    const sortedNotifs = [...notifications].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const baseOrder = chat.messages.length;
    sortedNotifs.forEach((n, i) => {
      items.push({ kind: 'notification' as const, data: n, order: baseOrder + i });
    });
    return items;
  }, [chat.messages, notifications]);

  const handleNewChat = useCallback(() => {
    conversations.select(null);
    setConversationStrategy(undefined);
    setIsContextStrategyLocked(false);
    restoreStoredParams();
    setSidebarOpen(false);
  }, [conversations, restoreStoredParams]);

  const handleContextStrategyChange = useCallback(
    async (nextStrategy: ContextStrategyType) => {
      const previousStrategy = (currentStrategy || params.contextStrategy) as ContextStrategyType;
      setParam('contextStrategy', nextStrategy);

      if (!chat.conversationId || isContextStrategyLocked) {
        return;
      }

      setConversationStrategy(nextStrategy);
      try {
        await updateConversationContext(chat.conversationId, {
          strategyType: nextStrategy,
        });
      } catch (error) {
        console.error('Failed to update context strategy', error);
        setConversationStrategy(previousStrategy);
        setParam('contextStrategy', previousStrategy);
      }
    },
    [chat.conversationId, currentStrategy, isContextStrategyLocked, params.contextStrategy, setParam],
  );

  const handleSend = useCallback(
    async (text: string) => {
      let currentConvId = chat.conversationId;
      const effectiveContextStrategy = (currentStrategy || params.contextStrategy) as ContextStrategyType;
      if (!currentConvId) {
        // Need a project to create a conversation
        if (!activeProject && tasks.length === 0) {
          console.error('No project available to create conversation');
          return;
        }
        const projectId = activeProject?.id || tasks[0]?.id;
        if (!projectId) return;
        const conv = await conversations.create(
          projectId,
          params.provider,
          params.model,
          params.systemPrompt,
          params.ragEnabled,
          params.ragQueryRewriteEnabled,
          params.ragMode,
          effectiveContextStrategy,
        );
        currentConvId = conv.id;
        chat.setConversationId(conv.id);
      }
      // Add user message to UI
      const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim() };
      chat.setMessages((prev: Message[]) => [...prev, userMsg]);
      setIsContextStrategyLocked(true);
      // Start pipeline
      pipeline.start(text.trim(), currentConvId, {
        ...params,
        contextStrategy: effectiveContextStrategy,
      });
      if (tasks.length > 0) {
        conversations.refresh(tasks.map(t => t.id));
      }
      if (!conversationStrategy) {
        setConversationStrategy(effectiveContextStrategy);
      }
      if (currentStrategy === 'sticky_facts' && chat.conversationId) {
        facts.loadFacts(chat.conversationId);
      }
    },
    [chat, params, conversations, currentStrategy, facts, conversationStrategy, pipeline, activeProject, tasks],
  );

  // Sync auto-created conversationId back to conversations
  useEffect(() => {
    if (chat.conversationId && !conversations.activeId) {
      conversations.select(chat.conversationId);
      prevActiveIdRef.current = chat.conversationId; // prevent re-load
      // Set the strategy for the newly created conversation
      if (!conversationStrategy) {
        setConversationStrategy(params.contextStrategy);
      }
      setIsContextStrategyLocked(chat.messages.length > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.conversationId, chat.messages.length]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      conversations.select(id);
      setSidebarOpen(false);
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const wasActive = conversations.activeId === id;
      await conversations.remove(id);
      if (wasActive) {
        chat.startNew();
        setConversationStrategy(undefined);
        setIsContextStrategyLocked(false);
        restoreStoredParams();
      }
    },
    [conversations, chat, restoreStoredParams],
  );

  const handleNewConversationInProject = useCallback(
    async (projectId: string) => {
      const conv = await conversations.create(
        projectId,
        params.provider,
        params.model,
        params.systemPrompt,
        params.ragEnabled,
        params.ragQueryRewriteEnabled,
        params.ragMode,
        currentStrategy,
      );
      setConversationStrategy(currentStrategy);
      setIsContextStrategyLocked(false);
      conversations.select(conv.id);
      setSidebarOpen(false);
    },
    [conversations, currentStrategy, params],
  );

  // Handle pipeline completion
  useEffect(() => {
    if (pipeline.pipelineState?.status === 'completed') {
      const finalContent = pipeline.pipelineState.finalContent;
      const content = finalContent || (() => {
        const execStep = [...(pipeline.pipelineState!.steps || [])].reverse().find(
          (s) => s.stepType === 'execution' && s.status === 'completed',
        );
        return execStep?.content;
      })();

      if (content) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
        };
        chat.setMessages((prev: Message[]) => [...prev, assistantMsg]);
      }
      if (chat.conversationId) {
        chat.loadConversation(chat.conversationId).then((detail) => {
          setConversationStrategy(detail?.contextStrategy || undefined);
          if (detail) {
            hydrateConversationParams({
              provider: detail.provider as AIParams['provider'],
              model: detail.model,
              temperature: detail.temperature,
              maxTokens: detail.maxTokens,
              repetitionPenalty: detail.repetitionPenalty,
              systemPrompt: detail.systemPrompt || '',
              contextLimit: detail.contextLimit,
              ragEnabled: detail.ragEnabled,
              ragQueryRewriteEnabled: detail.ragQueryRewriteEnabled,
              ragMode: detail.ragMode,
              contextStrategy: (detail.contextStrategy as ContextStrategyType) || params.contextStrategy,
            });
          }
          loadSubscriptions(chat.conversationId!);
          pipeline.reset();
        });
      } else {
        pipeline.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.pipelineState?.status, pipeline.pipelineState?.finalContent]);

  return (
    <>
      <div className="flex h-screen bg-white">
        {/* Sidebar */}
        <ConversationSidebar
          conversations={conversations.conversations}
          activeId={conversations.activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          tasks={tasks}
          onCreateTask={async (title: string, description?: string, invs?: string[]) => {
            const project = await addTask(title, description);
            if (invs && invs.length > 0 && project?.id) {
              for (const content of invs) {
                await addProjectInvariant(project.id, content);
              }
            }
          }}
          onDeleteTask={async (id: string) => {
            await removeTask(id);
            if (tasks.length > 0) {
              await conversations.refresh(tasks.filter(t => t.id !== id).map(t => t.id));
            }
            // If active conversation belonged to deleted project, reset
            if (conversations.activeId) {
              const still = conversations.conversations.find(c => c.id === conversations.activeId);
              if (!still || still.projectId === id) {
                conversations.select(null);
                chat.startNew();
              }
            }
          }}
          onNewConversationInTask={handleNewConversationInProject}
          invariants={invariantsHook.invariants}
          onLoadInvariants={invariantsHook.load}
          onAddInvariant={invariantsHook.add}
          onRemoveInvariant={invariantsHook.remove}
          invariantsActiveTaskId={invariantsHook.activeTaskId}
        />

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                aria-label="Открыть список диалогов"
              >
                <Menu size={20} />
              </button>
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <span className="font-semibold text-gray-900">ChatGPT App</span>
              {activeProject && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-md">
                  <FolderOpen size={12} className="text-amber-500" />
                  <span className="text-[11px] font-medium text-amber-700 max-w-[160px] truncate">{activeProject.title}</span>
                </div>
              )}
              {activeProject && invariantsHook.invariants.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-md">
                  <Shield size={11} className="text-red-500" />
                  <span className="text-[10px] font-medium text-red-700">
                    {invariantsHook.invariants.length} инвар.
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/personalization')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                title="Персонализация"
              >
                <Brain size={15} className="text-purple-500" />
                <span className="text-sm">{user?.username}</span>
              </button>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Выйти
              </button>
            </div>
          </header>

          {/* Context indicator */}
          <ContextIndicator contextWindow={chat.contextWindow} conversationTotals={chat.conversationTotals} />

          {/* Subscription indicator */}
          <SubscriptionIndicator subscriptions={subscriptions} />

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            role="log"
            aria-label="Сообщения чата"
            aria-live="polite"
          >
            {chat.isLoadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : chat.messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-6">
                {timeline.map((item) => {
                  if (item.kind === 'notification') {
                    return (
                      <NotificationBubble
                        key={`notif-${item.data.id}`}
                        notification={item.data}
                        onMarkRead={markRead}
                      />
                    );
                  }
                  const msg = item.data;
                  return (
                    <div key={msg.id}>
                      <MessageBubble
                        role={msg.role}
                        content={msg.content}
                        error={msg.error}
                        appliedParams={msg.appliedParams}
                        cost={msg.cost}
                        usage={msg.usage}
                        durationMs={msg.durationMs}
                        truncation={msg.truncation}
                        contextUsedTokens={msg.contextUsedTokens}
                        contextMaxTokens={msg.contextMaxTokens}
                        messageId={msg.id}
                        debugData={msg.debugData}
                      />
                    </div>
                  );
                })}
                {chat.isLoading && <TypingIndicator />}
                {pipeline.pipelineState && pipeline.pipelineState.status !== 'completed' && (
                  <PipelineMessageBubble
                    pipelineState={pipeline.pipelineState}
                    onPause={pipeline.pause}
                    onResume={pipeline.resume}
                    onCancel={pipeline.cancel}
                  />
                )}
              </div>
            )}
          </div>

          {/* Facts panel */}
          {currentStrategy === 'sticky_facts' && chat.conversationId && (
            <FactsPanel
              facts={facts.facts}
              onAdd={facts.addFact}
              onRemove={facts.removeFact}
              isLoading={facts.isLoading}
            />
          )}

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={chat.isLoading || pipeline.isRunning}
            showParams={showParams}
            onToggleParams={() => setShowParams((v) => !v)}
            hasNonDefaults={hasNonDefaults}
          />
        </div>
      </div>

      {/* Params overlay */}
      {showParams && (
        <div
          className="fixed inset-0 bg-black/20 z-30"
          onClick={() => setShowParams(false)}
        />
      )}

      {/* Params drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-lg z-40 transform transition-transform duration-200 ${
          showParams ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <AIParamsPanel
          params={params}
          setParam={setParam}
          resetParams={resetParams}
          hasNonDefaults={hasNonDefaults}
          onClose={() => setShowParams(false)}
          contextStrategyValue={currentStrategy as ContextStrategyType}
          isContextStrategyLocked={isContextStrategyLocked}
          onChangeContextStrategy={handleContextStrategyChange}
        />
      </div>
    </>
  );
}
