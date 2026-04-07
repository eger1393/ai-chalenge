'use client';

import { useState, useEffect, useCallback } from 'react';
import { Project } from '@/types/task';
import { listProjects, createProject, deleteProject, updateProject } from '@/lib/api';

export function useTasks() {
  const [tasks, setTasks] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await listProjects('active');
      setTasks(data);
    } catch (e) {
      console.error('Failed to load projects', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTask = useCallback(async (title: string, description?: string) => {
    const project = await createProject({ title, description });
    setTasks(prev => [project, ...prev]);
    return project;
  }, []);

  const removeTask = useCallback(async (id: string) => {
    await deleteProject(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const archiveTask = useCallback(async (id: string) => {
    await updateProject(id, { status: 'archived' });
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tasks, isLoading, addTask, removeTask, archiveTask, reload: load };
}
