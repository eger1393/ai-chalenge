'use client';

import { useState, useCallback } from 'react';
import { ProjectInvariant } from '@/types/task';
import { getProjectInvariants, addProjectInvariant, removeProjectInvariant } from '@/lib/api';

export function useInvariants() {
  const [invariants, setInvariants] = useState<ProjectInvariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const load = useCallback(async (projectId: string) => {
    setIsLoading(true);
    setActiveTaskId(projectId);
    try {
      const data = await getProjectInvariants(projectId);
      setInvariants(data);
    } catch {
      setInvariants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const add = useCallback(async (content: string) => {
    if (!activeTaskId) return;
    const inv = await addProjectInvariant(activeTaskId, content);
    setInvariants(prev => [...prev, inv]);
  }, [activeTaskId]);

  const remove = useCallback(async (invariantId: string) => {
    if (!activeTaskId) return;
    await removeProjectInvariant(activeTaskId, invariantId);
    setInvariants(prev => prev.filter(i => i.id !== invariantId));
  }, [activeTaskId]);

  const reset = useCallback(() => {
    setInvariants([]);
    setActiveTaskId(null);
  }, []);

  return { invariants, isLoading, activeTaskId, load, add, remove, reset };
}
