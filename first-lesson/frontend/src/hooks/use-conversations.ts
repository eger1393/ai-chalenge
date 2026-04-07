'use client';

import { useState, useCallback } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const load = useCallback(async (projectId: string) => {
    try {
      setIsLoading(true);
      setActiveProjectId(projectId);
      const list = await listConversations(projectId);
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (projectIds: string[]) => {
    try {
      setIsLoading(true);
      const allConvs: Conversation[] = [];
      for (const pid of projectIds) {
        const list = await listConversations(pid);
        allConvs.push(...list);
      }
      setConversations(allConvs);
    } catch (e) {
      console.error('Failed to load conversations', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(
    async (projectId: string, model?: string, systemPrompt?: string) => {
      const conv = await createConversation({ projectId, model, systemPrompt });
      setConversations((prev) => [conv, ...prev]);
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

  const refresh = useCallback(async (projectIds?: string[]) => {
    if (projectIds && projectIds.length > 0) {
      await loadAll(projectIds);
    } else if (activeProjectId) {
      await load(activeProjectId);
    }
  }, [load, loadAll, activeProjectId]);

  return {
    conversations,
    activeId,
    isLoading,
    activeProjectId,
    create,
    select,
    remove,
    rename,
    refresh,
    load,
    loadAll,
  };
}
