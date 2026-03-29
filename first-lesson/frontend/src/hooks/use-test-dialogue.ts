'use client';

import { useState, useCallback, useRef } from 'react';
import { startTestDialogue } from '@/lib/api';
import { AIParams } from '@/types/ai-params';
import { MessageDebugData } from '@/types/conversation';
import { Message } from './use-chat';

export function useTestDialogue() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((topic: string, pairsCount: number, aiParams?: AIParams) => {
    setIsGenerating(true);
    setMessages([]);
    setProgress({ current: 0, total: pairsCount });
    setError(null);
    setConversationId(null);

    abortRef.current = startTestDialogue(
      { topic, pairsCount },
      aiParams,
      (event) => {
        switch (event.type) {
          case 'started':
            setConversationId(event.conversationId);
            setProgress({ current: 0, total: event.totalPairs });
            break;
          case 'user_message':
            setMessages(prev => [...prev, {
              id: event.messageId || `test-user-${event.pair}`,
              role: 'user' as const,
              content: event.content,
              isTestGenerated: true,
            }]);
            break;
          case 'assistant_message':
            setMessages(prev => [...prev, {
              id: event.messageId || `test-asst-${event.pair}`,
              role: 'assistant' as const,
              content: event.content,
              cost: event.cost,
              usage: event.usage,
              durationMs: event.durationMs,
              debugData: event.debug as MessageDebugData | undefined,
              isTestGenerated: true,
              contextUsedTokens: (event.contextWindow as Record<string, number> | undefined)?.usedTokens,
              contextMaxTokens: (event.contextWindow as Record<string, number> | undefined)?.maxTokens,
              truncation: event.truncation as { droppedMessages: number; droppedTokens: number } | undefined,
            }]);
            setProgress(prev => ({ ...prev, current: event.pair + 1 }));
            break;
          case 'complete':
            setIsGenerating(false);
            break;
          case 'error':
            setError(event.message);
            setIsGenerating(false);
            break;
        }
      },
    );
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setProgress({ current: 0, total: 0 });
    setError(null);
  }, []);

  return { isGenerating, progress, messages, conversationId, error, start, abort, reset };
}
