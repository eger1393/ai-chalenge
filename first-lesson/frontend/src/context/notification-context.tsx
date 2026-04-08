'use client';

import React, { createContext, useContext } from 'react';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { useNotifications } from '@/hooks/use-notifications';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { IssueNotification, IssueSubscription } from '@/types/notification';

interface NotificationContextType {
  notifications: IssueNotification[];
  unreadCount: number;
  subscriptions: IssueSubscription[];
  subscriptionsLoading: boolean;
  loadNotifications: (conversationId: string) => Promise<void>;
  loadSubscriptions: (conversationId?: string) => Promise<void>;
  subscribe: (repository: string, conversationId: string) => Promise<IssueSubscription>;
  markRead: (id: string) => Promise<void>;
  markAllRead: (conversationId: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const notif = useNotifications();
  const subs = useSubscriptions();

  useNotificationStream((n) => {
    notif.addNotification(n);
  });

  return (
    <NotificationContext.Provider
      value={{
        notifications: notif.notifications,
        unreadCount: notif.unreadCount,
        subscriptions: subs.subscriptions,
        subscriptionsLoading: subs.loading,
        loadNotifications: notif.loadNotifications,
        loadSubscriptions: subs.loadSubscriptions,
        subscribe: subs.subscribe,
        markRead: notif.markRead,
        markAllRead: notif.markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotificationContext must be used within NotificationProvider');
  return ctx;
}
