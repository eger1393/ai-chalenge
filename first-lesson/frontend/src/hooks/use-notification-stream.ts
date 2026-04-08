'use client';

import { useEffect, useRef } from 'react';
import { IssueNotification } from '@/types/notification';
import { useAuth } from '@/context/auth-context';
import { getAccessToken } from '@/lib/tokens';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export function useNotificationStream(
  onNotification: (notification: IssueNotification) => void,
) {
  const { isAuthenticated } = useAuth();
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = getAccessToken();
    if (!token) return;

    const es = new EventSource(
      `${API_BASE}/notifications/stream?token=${encodeURIComponent(token)}`,
    );

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_notification') {
          onNotificationRef.current(data.notification);
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
      console.warn('Notification stream error, will auto-reconnect');
    };

    return () => es.close();
  }, [isAuthenticated]);
}
