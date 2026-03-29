'use client';

import { useState, useCallback } from 'react';
import { ConversationBranch } from '@/types/conversation';
import { getConversationBranches, createBranch, activateBranch, deleteBranch } from '@/lib/api';

export function useBranches(conversationId: string | null) {
  const [branches, setBranches] = useState<ConversationBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadBranches = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const data = await getConversationBranches(id);
      setBranches(data);
      const active = data.find((b) => b.isActive);
      if (active) {
        setActiveBranchId(active.id);
      }
    } catch (e) {
      console.error('Failed to load branches', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createNewBranch = useCallback(async (name: string, checkpointMessageId: string) => {
    if (!conversationId) return;
    try {
      const branch = await createBranch(conversationId, name, checkpointMessageId);
      setBranches((prev) => [...prev, branch]);
      setActiveBranchId(branch.id);
    } catch (e) {
      console.error('Failed to create branch', e);
    }
  }, [conversationId]);

  const switchBranch = useCallback(async (branchId: string) => {
    if (!conversationId) return;
    try {
      await activateBranch(conversationId, branchId);
      setBranches((prev) =>
        prev.map((b) => ({ ...b, isActive: b.id === branchId }))
      );
      setActiveBranchId(branchId);
    } catch (e) {
      console.error('Failed to switch branch', e);
    }
  }, [conversationId]);

  const removeBranch = useCallback(async (branchId: string) => {
    if (!conversationId) return;
    try {
      await deleteBranch(conversationId, branchId);
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
      if (activeBranchId === branchId) {
        setActiveBranchId(null);
      }
    } catch (e) {
      console.error('Failed to delete branch', e);
    }
  }, [conversationId, activeBranchId]);

  return { branches, activeBranchId, isLoading, loadBranches, createNewBranch, switchBranch, removeBranch };
}
