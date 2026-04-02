'use client';

import { useState, useCallback } from 'react';
import { TaskInvariant } from '@/types/task';
import { getTaskInvariants, addTaskInvariant, removeTaskInvariant } from '@/lib/api';

export function useInvariants() {
  const [invariants, setInvariants] = useState<TaskInvariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const load = useCallback(async (taskId: string) => {
    setIsLoading(true);
    setActiveTaskId(taskId);
    try {
      const data = await getTaskInvariants(taskId);
      setInvariants(data);
    } catch {
      setInvariants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const add = useCallback(async (content: string) => {
    if (!activeTaskId) return;
    const inv = await addTaskInvariant(activeTaskId, content);
    setInvariants(prev => [...prev, inv]);
  }, [activeTaskId]);

  const remove = useCallback(async (invariantId: string) => {
    if (!activeTaskId) return;
    await removeTaskInvariant(activeTaskId, invariantId);
    setInvariants(prev => prev.filter(i => i.id !== invariantId));
  }, [activeTaskId]);

  const reset = useCallback(() => {
    setInvariants([]);
    setActiveTaskId(null);
  }, []);

  return { invariants, isLoading, activeTaskId, load, add, remove, reset };
}
