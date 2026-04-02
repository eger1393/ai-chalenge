'use client';

import { useState, useCallback, useRef } from 'react';
import { sendMessage, createConversation, getConversation } from '@/lib/api';
import { AIParams, AppliedParams, DEFAULT_AI_PARAMS, Usage } from '@/types/ai-params';
import { ContextWindow, ConversationTotals, MessageDebugData } from '@/types/conversation';

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
  isTestGenerated?: boolean;
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
      setMessages(
        detail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          cost: m.cost,
          durationMs: m.durationMs,
          usage: m.promptTokens || m.completionTokens ? {
            promptTokens: m.promptTokens || 0,
            completionTokens: m.completionTokens || 0,
            totalTokens: (m.promptTokens || 0) + (m.completionTokens || 0),
            currentMessageTokens: m.currentMessageTokens || undefined,
            historyTokens: m.historyTokens || undefined,
          } : m.usage,
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
          debugData: m.debugData || undefined,
        })),
      );
      const lastAssistantWithContext = [...detail.messages].reverse().find(
        m => m.role === 'assistant' && m.contextMaxTokens
      );
      if (lastAssistantWithContext) {
        setContextWindow({
          model: lastAssistantWithContext.appliedModel || detail.model,
          maxTokens: lastAssistantWithContext.contextMaxTokens!,
          usedTokens: lastAssistantWithContext.contextUsedTokens || 0,
          usagePercent: Math.round(
            ((lastAssistantWithContext.contextUsedTokens || 0) / lastAssistantWithContext.contextMaxTokens!) * 100
          ),
        });
      }
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

  const send = useCallback(
    async (text: string, params?: AIParams) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        let currentConvId = conversationIdRef.current;

        // Auto-create conversation if none active
        if (!currentConvId) {
          const conv = await createConversation({
            model: params?.model,
            systemPrompt: params?.systemPrompt || undefined,
            contextStrategy: params?.contextStrategy,
          });
          currentConvId = conv.id;
          setConversationId(conv.id);
          conversationIdRef.current = conv.id;
        }

        {
          const response = await sendMessage(
            text.trim(),
            [],
            params,
            currentConvId,
          );

          if (response.contextWindow) {
            setContextWindow(response.contextWindow);
          }
          if (response.conversationTotals) {
            setConversationTotals(response.conversationTotals);
          }

          const hasDebugData = response.strategyMetadata || response.memoryLayers;
          const assistantMessage: Message = {
            id: response.assistantMessageId || (Date.now() + 1).toString(),
            role: 'assistant',
            content: response.reply,
            appliedParams: response.appliedParams,
            cost: response.cost,
            usage: response.usage,
            durationMs: response.durationMs,
            truncation: response.truncation,
            contextUsedTokens: response.contextWindow?.usedTokens,
            contextMaxTokens: response.contextWindow?.maxTokens,
            debugData: hasDebugData ? {
              strategyType: (response.strategyMetadata as Record<string, unknown>)?.strategy as string || 'sliding_window',
              contextMessagesCount: (response.strategyMetadata as Record<string, unknown>)?.originalMessagesCount as number || 0,
              contextMessagesAfterTruncation: (response.strategyMetadata as Record<string, unknown>)?.keptMessagesCount as number || 0,
              tokenBreakdown: response.usage ? {
                system: response.usage.systemPromptTokens || 0,
                history: response.usage.historyTokens || 0,
                current: response.usage.currentMessageTokens || 0,
                total: response.usage.totalTokens || 0,
              } : undefined,
              strategyMetadata: response.strategyMetadata,
              memoryLayers: response.memoryLayers,
            } : undefined,
          };

          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch (err: unknown) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            err instanceof Error
              ? err.message
              : 'Произошла ошибка. Попробуйте ещё раз.',
          error: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    isLoadingHistory,
    send,
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
