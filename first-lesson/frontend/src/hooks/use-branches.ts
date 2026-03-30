'use client';

import { useState, useCallback } from 'react';
import { Checkpoint, ConversationBranch, ConversationMessage } from '@/types/conversation';
import {
  getConversationBranches,
  getCheckpoints,
  createCheckpoint as apiCreateCheckpoint,
  createBranch,
  activateBranch,
  deleteBranch,
  getBranchMessages,
} from '@/lib/api';

export function useBranches(conversationId: string | null) {
  const [branches, setBranches] = useState<ConversationBranch[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadBranches = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const [branchData, checkpointData] = await Promise.all([
        getConversationBranches(id),
        getCheckpoints(id),
      ]);
      setBranches(branchData);
      setCheckpoints(checkpointData);
      const active = branchData.find((b) => b.isActive);
      if (active) {
        setActiveBranchId(active.id);
      }
    } catch (e) {
      console.error('Failed to load branches', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCheckpoint = useCallback(async (messageId: string, label?: string): Promise<Checkpoint | null> => {
    if (!conversationId) return null;
    try {
      const checkpoint = await apiCreateCheckpoint(conversationId, messageId, label);
      setCheckpoints((prev) => [...prev, checkpoint]);
      // Reload branches since creating first checkpoint auto-creates main branch
      const branchData = await getConversationBranches(conversationId);
      setBranches(branchData);
      const active = branchData.find((b) => b.isActive);
      if (active) {
        setActiveBranchId(active.id);
      }
      return checkpoint;
    } catch (e) {
      console.error('Failed to create checkpoint', e);
      return null;
    }
  }, [conversationId]);

  const createNewBranch = useCallback(async (checkpointId: string, name: string): Promise<ConversationBranch | null> => {
    if (!conversationId) return null;
    try {
      const branch = await createBranch(conversationId, checkpointId, name);
      setBranches((prev) => [...prev, branch]);
      setActiveBranchId(branch.id);
      return branch;
    } catch (e) {
      console.error('Failed to create branch', e);
      return null;
    }
  }, [conversationId]);

  const switchBranch = useCallback(async (branchId: string): Promise<ConversationMessage[] | null> => {
    if (!conversationId) return null;
    try {
      await activateBranch(conversationId, branchId);
      setBranches((prev) =>
        prev.map((b) => ({ ...b, isActive: b.id === branchId }))
      );
      setActiveBranchId(branchId);
      // Load messages for this branch
      const messages = await getBranchMessages(conversationId, branchId);
      return messages;
    } catch (e) {
      console.error('Failed to switch branch', e);
      return null;
    }
  }, [conversationId]);

  const removeBranch = useCallback(async (branchId: string) => {
    if (!conversationId) return;
    try {
      await deleteBranch(conversationId, branchId);
      setBranches((prev) => prev.filter((b) => b.id !== branchId));
      if (activeBranchId === branchId) {
        // Switch to main
        const mainBranch = branches.find((b) => b.name === 'main');
        if (mainBranch) {
          setActiveBranchId(mainBranch.id);
        } else {
          setActiveBranchId(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete branch', e);
    }
  }, [conversationId, activeBranchId, branches]);

  return {
    branches,
    checkpoints,
    activeBranchId,
    isLoading,
    loadBranches,
    createCheckpoint,
    createNewBranch,
    switchBranch,
    removeBranch,
  };
}
