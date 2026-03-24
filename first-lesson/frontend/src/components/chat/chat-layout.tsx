'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useChat } from '@/hooks/use-chat';
import { useAIParams } from '@/hooks/use-ai-params';
import { useConsilium } from '@/hooks/use-consilium';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useConversations } from '@/hooks/use-conversations';
import { ConversationSidebar } from './conversation-sidebar';
import { ContextIndicator } from './context-indicator';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';
import { AIParamsPanel } from './ai-params-panel';

export function ChatLayout() {
  const { user, logout } = useAuth();
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
  const [showParams, setShowParams] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useAutoScroll(chat.messages);

  // Track previous activeId to avoid re-loading the same conversation
  const prevActiveIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const activeId = conversations.activeId;
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;

    if (activeId) {
      chat.loadConversation(activeId);
    } else {
      chat.startNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.activeId]);

  const handleNewChat = useCallback(() => {
    conversations.select(null);
    setSidebarOpen(false);
  }, [conversations]);

  const handleSend = useCallback(
    async (text: string) => {
      await chat.send(text, params, consilium);
      // After sending, sync the conversationId to conversations hook
      // and refresh the list
      if (chat.conversationId && !conversations.activeId) {
        // The chat hook auto-created a conversation; select it
        // We need to get the id after send completes
      }
      conversations.refresh();
    },
    [chat, params, consilium, conversations],
  );

  // Sync auto-created conversationId back to conversations
  useEffect(() => {
    if (chat.conversationId && !conversations.activeId) {
      conversations.select(chat.conversationId);
      prevActiveIdRef.current = chat.conversationId; // prevent re-load
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
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{user?.username}</span>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Выйти
              </button>
            </div>
          </header>

          {/* Context indicator */}
          <ContextIndicator contextWindow={chat.contextWindow} />

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
                {chat.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    error={msg.error}
                    appliedParams={msg.appliedParams}
                    expertOpinions={msg.expertOpinions}
                    isConsilium={msg.isConsilium}
                    cost={msg.cost}
                  />
                ))}
                {chat.isLoading && <TypingIndicator />}
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={chat.isLoading}
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
        />
      </div>
    </>
  );
}
