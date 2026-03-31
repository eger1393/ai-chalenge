'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/types/task';
import { listTasks, createTask, deleteTask, updateTask } from '@/lib/api';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await listTasks('active');
      setTasks(data);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTask = useCallback(async (title: string, description?: string) => {
    const task = await createTask({ title, description });
    setTasks(prev => [task, ...prev]);
    return task;
  }, []);

  const removeTask = useCallback(async (id: string) => {
    await deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const archiveTask = useCallback(async (id: string) => {
    await updateTask(id, { status: 'archived' });
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tasks, isLoading, addTask, removeTask, archiveTask, reload: load };
}
