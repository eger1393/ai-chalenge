'use client';

import { useAuth } from '@/context/auth-context';
import { useChat } from '@/hooks/use-chat';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ChatInput } from './chat-input';
import { EmptyState } from './empty-state';

export function ChatWindow() {
  const { user, logout } = useAuth();
  const { messages, isLoading, send } = useChat();
  const scrollRef = useAutoScroll(messages);

  return (
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
              />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={send} disabled={isLoading} />
    </div>
  );
}
