'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { useChat } from '@/hooks/use-chat';
import { useAIParams } from '@/hooks/use-ai-params';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';
import { AIParamsPanel } from './ai-params-panel';

export function ChatWindow() {
  const { user, logout } = useAuth();
  const { messages, isLoading } = useChat();
  const { params, setParam, resetParams, hasNonDefaults } = useAIParams();
  const [showParams, setShowParams] = useState(false);
  const scrollRef = useAutoScroll(messages);

  const handleSend = useCallback(
    (_text: string) => { /* pipeline mode only — use ChatLayout instead */ },
    [],
  );

  return (
    <>
      <div className="flex flex-col h-screen bg-white">
        {/* Header */}
        <header className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
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

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          role="log"
          aria-label="Сообщения чата"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  error={msg.error}
                  appliedParams={msg.appliedParams}
                  cost={msg.cost}
                  usage={msg.usage}
                  durationMs={msg.durationMs}
                />
              ))}
              {isLoading && <TypingIndicator />}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          showParams={showParams}
          onToggleParams={() => setShowParams((v) => !v)}
          hasNonDefaults={hasNonDefaults}
        />
      </div>

      {/* Overlay */}
      {showParams && (
        <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setShowParams(false)} />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-lg z-40 transform transition-transform duration-200 ${showParams ? 'translate-x-0' : 'translate-x-full'}`}>
        <AIParamsPanel
          params={params}
          setParam={setParam}
          resetParams={resetParams}
          hasNonDefaults={hasNonDefaults}
          onClose={() => setShowParams(false)}
          contextStrategyValue={params.contextStrategy}
          onChangeContextStrategy={(value) => setParam('contextStrategy', value)}
        />
      </div>
    </>
  );
}
