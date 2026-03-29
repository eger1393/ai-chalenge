'use client';

import { useState, useCallback } from 'react';
import { ConversationFact } from '@/types/conversation';
import { getConversationFacts, setConversationFact, deleteConversationFact } from '@/lib/api';

export function useFacts(conversationId: string | null) {
  const [facts, setFacts] = useState<ConversationFact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadFacts = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const data = await getConversationFacts(id);
      setFacts(data);
    } catch (e) {
      console.error('Failed to load facts', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addFact = useCallback(async (key: string, value: string) => {
    if (!conversationId) return;
    // Optimistic update
    const newFact: ConversationFact = { key, value, updatedAt: new Date().toISOString() };
    setFacts((prev) => {
      const existing = prev.findIndex((f) => f.key === key);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newFact;
        return updated;
      }
      return [...prev, newFact];
    });
    try {
      await setConversationFact(conversationId, key, value);
    } catch (e) {
      console.error('Failed to set fact', e);
      // Revert on error
      if (conversationId) loadFacts(conversationId);
    }
  }, [conversationId, loadFacts]);

  const removeFact = useCallback(async (key: string) => {
    if (!conversationId) return;
    // Optimistic update
    setFacts((prev) => prev.filter((f) => f.key !== key));
    try {
      await deleteConversationFact(conversationId, key);
    } catch (e) {
      console.error('Failed to delete fact', e);
      if (conversationId) loadFacts(conversationId);
    }
  }, [conversationId, loadFacts]);

  return { facts, isLoading, loadFacts, addFact, removeFact };
}
