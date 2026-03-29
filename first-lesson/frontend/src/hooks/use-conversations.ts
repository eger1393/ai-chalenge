'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  listConversations,
  createConversation,
  deleteConversation as deleteConvApi,
  updateConversation,
} from '@/lib/api';
import { Conversation } from '@/types/conversation';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await listConversations(10);
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (model?: string, systemPrompt?: string, contextStrategy?: string) => {
      const conv = await createConversation({ model, systemPrompt, contextStrategy });
      setConversations((prev) => [conv, ...prev].slice(0, 10));
      setActiveId(conv.id);
      return conv;
    },
    [],
  );

  const select = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await deleteConvApi(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

  const rename = useCallback(async (id: string, title: string) => {
    await updateConversation(id, { title });
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    conversations,
    activeId,
    isLoading,
    create,
    select,
    remove,
    rename,
    refresh,
  };
}
