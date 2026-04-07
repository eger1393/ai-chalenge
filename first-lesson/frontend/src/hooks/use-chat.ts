'use client';

import { useState, useCallback, useRef } from 'react';
import { getConversation } from '@/lib/api';
import { AppliedParams, Usage } from '@/types/ai-params';
import { ContextWindow, ConversationTotals, ConversationMessage, MessageDebugData } from '@/types/conversation';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  appliedParams?: AppliedParams;
  cost?: number;
  usage?: Usage;
  durationMs?: number;
  truncation?: { droppedMessages: number; droppedTokens: number };
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  debugData?: MessageDebugData;
  status?: ConversationMessage['status'];
}

/**
 * Map a ConversationMessage envelope into UI Message(s).
 * Each envelope may produce 1 user message + 1 assistant message.
 */
function envelopeToMessages(envelope: ConversationMessage): Message[] {
  const msgs: Message[] = [];

  // User message
  if (envelope.userContent) {
    msgs.push({
      id: `${envelope.id}-user`,
      role: 'user',
      content: envelope.userContent,
    });
  }

  // Assistant message (only if there's content or the message is done/failed)
  if (envelope.assistantContent || envelope.status === 'done' || envelope.status === 'failed') {
    msgs.push({
      id: `${envelope.id}-assistant`,
      role: 'assistant',
      content: envelope.assistantContent || '',
      error: envelope.status === 'failed',
      status: envelope.status,
    });
  }

  return msgs;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [contextWindow, setContextWindow] = useState<ContextWindow | null>(null);
  const [conversationTotals, setConversationTotals] = useState<ConversationTotals | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    setIsLoadingHistory(true);
    setConversationId(id);
    conversationIdRef.current = id;
    try {
      const detail = await getConversation(id);

      // Map envelopes to UI messages
      const uiMessages: Message[] = [];
      for (const envelope of detail.messages) {
        uiMessages.push(...envelopeToMessages(envelope));
      }
      setMessages(uiMessages);

      if (detail.conversationTotals) {
        setConversationTotals(detail.conversationTotals);
      }
      return detail;
    } catch (e) {
      console.error('Failed to load conversation', e);
      return null;
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const startNew = useCallback(() => {
    setConversationId(null);
    conversationIdRef.current = null;
    setMessages([]);
    setContextWindow(null);
    setConversationTotals(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    clearMessages,
    conversationId,
    setConversationId,
    contextWindow,
    conversationTotals,
    loadConversation,
    startNew,
    setMessages,
  };
}
