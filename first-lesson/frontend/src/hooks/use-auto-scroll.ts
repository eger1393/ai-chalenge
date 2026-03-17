'use client';

import { useRef, useEffect } from 'react';
import type { Message } from './use-chat';

export function useAutoScroll(messages: Message[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNewMessage = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;

    if (isNewMessage || isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  return scrollRef;
}
