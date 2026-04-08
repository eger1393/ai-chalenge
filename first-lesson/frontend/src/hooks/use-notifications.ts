'use client';

import { useState, useCallback } from 'react';
import { IssueNotification } from '@/types/notification';
import * as api from '@/lib/api';

export function useNotifications() {
  const [notifications, setNotifications] = useState<IssueNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async (conversationId: string) => {
    const result = await api.getNotifications(conversationId);
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  }, []);

  const addNotification = useCallback((n: IssueNotification) => {
    setNotifications((prev) => [n, ...prev]);
    if (!n.isRead) setUnreadCount((prev) => prev + 1);
  }, []);

  const markRead = useCallback(async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async (conversationId: string) => {
    await api.markAllNotificationsRead(conversationId);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loadNotifications,
    addNotification,
    markRead,
    markAllRead,
    setNotifications,
  };
}
