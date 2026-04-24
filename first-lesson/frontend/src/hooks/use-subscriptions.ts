'use client';

import { useState, useCallback } from 'react';
import { IssueSubscription } from '@/types/notification';

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<IssueSubscription[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSubscriptions = useCallback(async (conversationId?: string) => {
    void conversationId;
    setSubscriptions([]);
    setLoading(false);
  }, []);

  return { subscriptions, loading, loadSubscriptions, setSubscriptions };
}
