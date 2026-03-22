'use client';

import { useState, useCallback } from 'react';
import { sendMessage, sendConsilium } from '@/lib/api';
import { AIParams, AppliedParams, ConsiliumParams, DEFAULT_AI_PARAMS, ExpertOpinion, Usage } from '@/types/ai-params';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  appliedParams?: AppliedParams;
  expertOpinions?: ExpertOpinion[];
  isConsilium?: boolean;
  cost?: number;
  usage?: Usage;
  durationMs?: number;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const send = useCallback(async (text: string, params?: AIParams, consilium?: ConsiliumParams) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const isExpertFilled = (e: { mode: 'role' | 'custom'; roleId?: string; systemPrompt: string }) =>
        (e.mode === 'role' && !!e.roleId) || (e.mode === 'custom' && e.systemPrompt.trim().length > 0);

      if (consilium?.enabled && consilium.experts.filter(isExpertFilled).length >= 2) {
        const activeExperts = consilium.experts.filter(isExpertFilled);
        const consiliumParams: Record<string, unknown> = {};
        if (params?.model !== undefined && params.model !== DEFAULT_AI_PARAMS.model) {
          consiliumParams.model = params.model;
        }
        if (params?.temperature !== undefined && params.temperature !== DEFAULT_AI_PARAMS.temperature) {
          consiliumParams.temperature = params.temperature;
        }
        if (params?.maxTokens !== undefined && params.maxTokens !== DEFAULT_AI_PARAMS.maxTokens) {
          consiliumParams.maxTokens = params.maxTokens;
        }

        const response = await sendConsilium(text.trim(), [], activeExperts, consiliumParams as { model?: string; temperature?: number; maxTokens?: number });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.reply,
          appliedParams: response.appliedParams,
          expertOpinions: response.expertOpinions,
          isConsilium: true,
          cost: response.cost,
          usage: response.usage,
          durationMs: response.durationMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const response = await sendMessage(text.trim(), [], params);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.reply,
          appliedParams: response.appliedParams,
          cost: response.cost,
          usage: response.usage,
          durationMs: response.durationMs,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (err: unknown) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Произошла ошибка. Попробуйте ещё раз.',
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, send, clearMessages };
}
