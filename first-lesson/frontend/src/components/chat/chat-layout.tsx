'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MessageSquare, FlaskConical, FolderOpen, Brain } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useChat, Message } from '@/hooks/use-chat';
import { useAIParams } from '@/hooks/use-ai-params';
import { useConsilium } from '@/hooks/use-consilium';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useConversations } from '@/hooks/use-conversations';
import { useTestDialogue } from '@/hooks/use-test-dialogue';
import { useFacts } from '@/hooks/use-facts';
import { useBranches } from '@/hooks/use-branches';
import { useTasks } from '@/hooks/use-tasks';
import { setConversationTask } from '@/lib/api';
import { ConversationSidebar } from './conversation-sidebar';
import { ContextIndicator } from './context-indicator';
import { BranchSelector } from './branch-selector';
import { CheckpointDivider } from './checkpoint-divider';
import { FactsPanel } from './facts-panel';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';
import { TestSetupForm } from './test-setup-form';
import { TestProgressBar } from './test-progress-bar';
import { AIParamsPanel } from './ai-params-panel';

export function ChatLayout() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const conversations = useConversations();
  const chat = useChat();
  const { params, setParam, resetParams, hasNonDefaults } = useAIParams();
  const {
    consilium,
    roles,
    toggleConsilium,
    setExpert,
    setExpertRole,
    addExpert,
    removeExpert,
  } = useConsilium();
  const testDialogue = useTestDialogue();
  const facts = useFacts(chat.conversationId);
  const branches = useBranches(chat.conversationId);
  const { tasks, addTask, removeTask } = useTasks();
  const [mode, setMode] = useState<'chat' | 'test'>('chat');
  const [showParams, setShowParams] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationStrategy, setConversationStrategy] = useState<string | undefined>(undefined);
  const scrollRef = useAutoScroll(chat.messages);

  // Track previous activeId to avoid re-loading the same conversation
  const prevActiveIdRef = useRef<string | null | undefined>(undefined);

  // Determine current strategy: conversation's fixed strategy or params strategy
  const currentStrategy = conversationStrategy || params.contextStrategy;

  // Active conversation & task for header badge
  const activeConversation = conversations.conversations.find(c => c.id === conversations.activeId);
  const activeTask = tasks.find(t => t.id === activeConversation?.taskId);

  useEffect(() => {
    const activeId = conversations.activeId;
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;

    if (activeId) {
      chat.loadConversation(activeId).then((detail) => {
        const conv = conversations.conversations.find((c) => c.id === activeId);
        const strategy = conv?.contextStrategy;
        const hasMessages = detail && detail.messages && detail.messages.length > 0;
        setConversationStrategy(hasMessages ? strategy : undefined);
        if (strategy === 'sticky_facts') {
          facts.loadFacts(activeId);
        } else if (strategy === 'branching') {
          branches.loadBranches(activeId);
        }
      });
    } else {
      chat.startNew();
      setConversationStrategy(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeId]);

  const handleNewChat = useCallback(() => {
    conversations.select(null);
    setConversationStrategy(undefined);
    setSidebarOpen(false);
  }, [conversations]);

  const handleSend = useCallback(
    async (text: string) => {
      await chat.send(text, params, consilium);
      conversations.refresh();
      if (!conversationStrategy) {
        setConversationStrategy(params.contextStrategy);
      }
      if (currentStrategy === 'sticky_facts' && chat.conversationId) {
        facts.loadFacts(chat.conversationId);
      }
    },
    [chat, params, consilium, conversations, currentStrategy, facts, conversationStrategy],
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.conversationId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      conversations.select(id);
      setSidebarOpen(false);
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await conversations.remove(id);
    },
    [conversations],
  );

  const handleNewConversationInTask = useCallback(
    async (taskId: string) => {
      const conv = await conversations.create(params.model, params.systemPrompt, params.contextStrategy);
      await setConversationTask(conv.id, taskId);
      await conversations.refresh();
      conversations.select(conv.id);
      setSidebarOpen(false);
    },
    [conversations, params],
  );

  const handleCreateCheckpoint = useCallback(
    async (messageId: string) => {
      const checkpoint = await branches.createCheckpoint(messageId);
      if (checkpoint) {
        // Reload conversation to see updated branch_ids on messages
        if (chat.conversationId) {
          await chat.loadConversation(chat.conversationId);
        }
      }
    },
    [branches, chat],
  );

  const handleCreateBranchFromCheckpoint = useCallback(
    async (checkpointId: string) => {
      const name = `Branch ${branches.branches.length + 1}`;
      const branch = await branches.createNewBranch(checkpointId, name);
      if (branch && chat.conversationId) {
        // Switch to the new branch (which is empty) - reload messages
        const messages = await branches.switchBranch(branch.id);
        if (messages) {
          chat.setMessages(
            messages.map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              cost: m.cost,
              isConsilium: m.isConsilium,
              durationMs: m.durationMs,
              usage: m.promptTokens || m.completionTokens ? {
                promptTokens: m.promptTokens || 0,
                completionTokens: m.completionTokens || 0,
                totalTokens: (m.promptTokens || 0) + (m.completionTokens || 0),
                currentMessageTokens: m.currentMessageTokens || undefined,
                historyTokens: m.historyTokens || undefined,
              } : undefined,
              appliedParams: m.appliedModel ? {
                model: m.appliedModel,
                temperature: m.appliedTemperature ?? 1.0,
                maxTokens: m.appliedMaxTokens ?? 16384,
              } : undefined,
              truncation: m.truncatedMessages ? {
                droppedMessages: m.truncatedMessages,
                droppedTokens: m.truncatedTokens || 0,
              } : undefined,
              contextUsedTokens: m.contextUsedTokens || undefined,
              contextMaxTokens: m.contextMaxTokens || undefined,
            })),
          );
        }
      }
    },
    [branches, chat],
  );

  const handleSwitchBranch = useCallback(
    async (branchId: string) => {
      const messages = await branches.switchBranch(branchId);
      if (messages) {
        chat.setMessages(
          messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            cost: m.cost,
            isConsilium: m.isConsilium,
            durationMs: m.durationMs,
            usage: m.promptTokens || m.completionTokens ? {
              promptTokens: m.promptTokens || 0,
              completionTokens: m.completionTokens || 0,
              totalTokens: (m.promptTokens || 0) + (m.completionTokens || 0),
              currentMessageTokens: m.currentMessageTokens || undefined,
              historyTokens: m.historyTokens || undefined,
            } : undefined,
            appliedParams: m.appliedModel ? {
              model: m.appliedModel,
              temperature: m.appliedTemperature ?? 1.0,
              maxTokens: m.appliedMaxTokens ?? 16384,
            } : undefined,
            truncation: m.truncatedMessages ? {
              droppedMessages: m.truncatedMessages,
              droppedTokens: m.truncatedTokens || 0,
            } : undefined,
            contextUsedTokens: m.contextUsedTokens || undefined,
            contextMaxTokens: m.contextMaxTokens || undefined,
          })),
        );
      }
    },
    [branches, chat],
  );

  const handleDeleteBranch = useCallback(
    async (branchId: string) => {
      await branches.removeBranch(branchId);
      // After deleting, reload main branch messages
      if (chat.conversationId) {
        const mainBranch = branches.branches.find((b) => b.name === 'main');
        if (mainBranch) {
          await handleSwitchBranch(mainBranch.id);
        }
      }
    },
    [branches, chat.conversationId, handleSwitchBranch],
  );

  const handleStartTest = useCallback((topic: string, pairsCount: number) => {
    testDialogue.start(topic, pairsCount, params);
  }, [testDialogue, params]);

  // After test generation completes, switch to the created conversation
  const prevTestConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      testDialogue.conversationId &&
      !testDialogue.isGenerating &&
      testDialogue.conversationId !== prevTestConvIdRef.current
    ) {
      prevTestConvIdRef.current = testDialogue.conversationId;
      conversations.select(testDialogue.conversationId);
      chat.loadConversation(testDialogue.conversationId);
      conversations.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDialogue.conversationId, testDialogue.isGenerating]);

  // Determine which messages to show
  const isTestMode = mode === 'test';
  const testInProgress = isTestMode && testDialogue.isGenerating;
  const displayMessages = testInProgress ? testDialogue.messages : chat.messages;

  // Build checkpoint map: messageId -> checkpoint
  const checkpointByMessageId = new Map(
    branches.checkpoints.map((cp) => [cp.messageId, cp])
  );

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
          onCreateTask={addTask}
          onDeleteTask={removeTask}
          onNewConversationInTask={handleNewConversationInTask}
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
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 ml-3">
                <button
                  onClick={() => { setMode('chat'); testDialogue.reset(); }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === 'chat' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MessageSquare className="w-3.5 h-3.5 inline mr-1" />Чат
                </button>
                <button
                  onClick={() => setMode('test')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mode === 'test' ? 'bg-white shadow-sm text-amber-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <FlaskConical className="w-3.5 h-3.5 inline mr-1" />Тест
                </button>
              </div>
              {activeTask && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-md">
                  <FolderOpen size={12} className="text-amber-500" />
                  <span className="text-[11px] font-medium text-amber-700 max-w-[160px] truncate">{activeTask.title}</span>
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

          {/* Branch selector */}
          {currentStrategy === 'branching' && branches.branches.length > 0 && (
            <BranchSelector
              branches={branches.branches}
              checkpoints={branches.checkpoints}
              activeBranchId={branches.activeBranchId}
              onSwitch={handleSwitchBranch}
              onCreateBranch={handleCreateBranchFromCheckpoint}
              onDeleteBranch={handleDeleteBranch}
            />
          )}

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
            ) : isTestMode && displayMessages.length === 0 && !testDialogue.isGenerating ? (
              <TestSetupForm onStart={handleStartTest} isGenerating={testDialogue.isGenerating} />
            ) : displayMessages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-6">
                {displayMessages.map((msg) => {
                  const checkpoint = checkpointByMessageId.get(msg.id);
                  return (
                    <div key={msg.id}>
                      <MessageBubble
                        role={msg.role}
                        content={msg.content}
                        error={msg.error}
                        appliedParams={msg.appliedParams}
                        expertOpinions={msg.expertOpinions}
                        isConsilium={msg.isConsilium}
                        cost={msg.cost}
                        usage={msg.usage}
                        durationMs={msg.durationMs}
                        truncation={msg.truncation}
                        contextUsedTokens={msg.contextUsedTokens}
                        contextMaxTokens={msg.contextMaxTokens}
                        showCheckpointButton={currentStrategy === 'branching' && msg.role === 'assistant'}
                        onCreateCheckpoint={currentStrategy === 'branching' ? handleCreateCheckpoint : undefined}
                        messageId={msg.id}
                        debugData={msg.debugData}
                        isTestGenerated={msg.isTestGenerated}
                      />
                      {checkpoint && (
                        <CheckpointDivider
                          checkpoint={checkpoint}
                          onCreateBranch={handleCreateBranchFromCheckpoint}
                        />
                      )}
                    </div>
                  );
                })}
                {chat.isLoading && <TypingIndicator />}
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

          {/* Test progress bar */}
          {testDialogue.isGenerating && (
            <TestProgressBar
              current={testDialogue.progress.current}
              total={testDialogue.progress.total}
              onAbort={testDialogue.abort}
            />
          )}

          {/* Test error */}
          {testDialogue.error && (
            <div className="max-w-3xl mx-auto px-4 py-2">
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {testDialogue.error}
              </div>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={chat.isLoading || testDialogue.isGenerating}
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
          consilium={consilium}
          roles={roles}
          toggleConsilium={toggleConsilium}
          setExpert={setExpert}
          setExpertRole={setExpertRole}
          addExpert={addExpert}
          removeExpert={removeExpert}
          conversationStrategy={conversationStrategy}
        />
      </div>
    </>
  );
}
