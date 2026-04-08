'use client';

import { useState, useCallback } from 'react';
import { IssueSubscription } from '@/types/notification';
import * as api from '@/lib/api';

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<IssueSubscription[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSubscriptions = useCallback(async (conversationId?: string) => {
    setLoading(true);
    try {
      const subs = conversationId
        ? await api.getConversationSubscriptions(conversationId)
        : await api.getSubscriptions();
      setSubscriptions(subs);
    } catch (e) {
      console.error('Failed to load subscriptions:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { subscriptions, loading, loadSubscriptions, setSubscriptions };
}
