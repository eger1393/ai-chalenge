'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ConsiliumParams, DEFAULT_CONSILIUM } from '@/types/ai-params';

const STORAGE_KEY = 'consiliumParams';
const MAX_EXPERTS = 3;
const MIN_EXPERTS = 2;

function loadFromStorage(): ConsiliumParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.enabled !== 'boolean' || !Array.isArray(parsed.experts)) return null;
    const experts = parsed.experts
      .filter(
        (e: unknown) =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as Record<string, unknown>).name === 'string' &&
          typeof (e as Record<string, unknown>).systemPrompt === 'string',
      )
      .slice(0, MAX_EXPERTS) as ConsiliumParams['experts'];
    if (experts.length < MIN_EXPERTS) return null;
    return { enabled: parsed.enabled, experts };
  } catch {
    return null;
  }
}

function saveToStorage(params: ConsiliumParams) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // storage full or unavailable
  }
}

export function useConsilium() {
  const [consilium, setConsilium] = useState<ConsiliumParams>(DEFAULT_CONSILIUM);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = loadFromStorage();
    if (stored) {
      setConsilium(stored);
    }
  }, []);

  const toggleConsilium = useCallback(() => {
    setConsilium((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      saveToStorage(next);
      return next;
    });
  }, []);

  const setExpert = useCallback(
    (index: number, field: 'name' | 'systemPrompt', value: string) => {
      setConsilium((prev) => {
        const experts = prev.experts.map((e, i) =>
          i === index ? { ...e, [field]: value } : e,
        );
        const next = { ...prev, experts };
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const addExpert = useCallback(() => {
    setConsilium((prev) => {
      if (prev.experts.length >= MAX_EXPERTS) return prev;
      const next = {
        ...prev,
        experts: [
          ...prev.experts,
          { name: `Эксперт ${prev.experts.length + 1}`, systemPrompt: '' },
        ],
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeExpert = useCallback((index: number) => {
    setConsilium((prev) => {
      if (prev.experts.length <= MIN_EXPERTS) return prev;
      const next = {
        ...prev,
        experts: prev.experts.filter((_, i) => i !== index),
      };
      saveToStorage(next);
      return next;
    });
  }, []);

  return { consilium, toggleConsilium, setExpert, addExpert, removeExpert };
}
