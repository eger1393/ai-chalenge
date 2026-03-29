'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AIParams, AVAILABLE_MODELS, DEFAULT_AI_PARAMS } from '@/types/ai-params';

const STORAGE_KEY = 'aiParams';

function loadFromStorage(): AIParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Migration: old summaryMode/summaryKeepLast -> new contextStrategy/slidingWindowKeepLast
    let contextStrategy = DEFAULT_AI_PARAMS.contextStrategy;
    let slidingWindowKeepLast = DEFAULT_AI_PARAMS.slidingWindowKeepLast;
    let factsKeepLast = DEFAULT_AI_PARAMS.factsKeepLast;

    if ('summaryMode' in parsed) {
      // Legacy format
      contextStrategy = 'sliding_window';
      slidingWindowKeepLast = typeof parsed.summaryKeepLast === 'number' ? parsed.summaryKeepLast : 10;
    } else {
      if (typeof parsed.contextStrategy === 'string' && ['sliding_window', 'sticky_facts', 'branching'].includes(parsed.contextStrategy)) {
        contextStrategy = parsed.contextStrategy;
      }
      if (typeof parsed.slidingWindowKeepLast === 'number') {
        slidingWindowKeepLast = parsed.slidingWindowKeepLast;
      }
      if (typeof parsed.factsKeepLast === 'number') {
        factsKeepLast = parsed.factsKeepLast;
      }
    }

    return {
      model: typeof parsed.model === 'string' && (AVAILABLE_MODELS as readonly string[]).includes(parsed.model) ? parsed.model : DEFAULT_AI_PARAMS.model,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_AI_PARAMS.temperature,
      maxTokens: typeof parsed.maxTokens === 'number' ? parsed.maxTokens : DEFAULT_AI_PARAMS.maxTokens,
      repetitionPenalty: typeof parsed.repetitionPenalty === 'number' ? parsed.repetitionPenalty : DEFAULT_AI_PARAMS.repetitionPenalty,
      systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : DEFAULT_AI_PARAMS.systemPrompt,
      contextLimit: typeof parsed.contextLimit === 'number' ? parsed.contextLimit : DEFAULT_AI_PARAMS.contextLimit,
      contextStrategy,
      slidingWindowKeepLast,
      factsKeepLast,
    };
  } catch {
    return null;
  }
}

function saveToStorage(params: AIParams) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // storage full or unavailable
  }
}

export function useAIParams() {
  const [params, setParams] = useState<AIParams>(DEFAULT_AI_PARAMS);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = loadFromStorage();
    if (stored) {
      setParams(stored);
    }
  }, []);

  const setParam = useCallback(<K extends keyof AIParams>(key: K, value: AIParams[K]) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      saveToStorage(next);
      return next;
    });
  }, []);

  const resetParams = useCallback(() => {
    setParams(DEFAULT_AI_PARAMS);
    saveToStorage(DEFAULT_AI_PARAMS);
  }, []);

  const hasNonDefaults =
    params.model !== DEFAULT_AI_PARAMS.model ||
    params.temperature !== DEFAULT_AI_PARAMS.temperature ||
    params.maxTokens !== DEFAULT_AI_PARAMS.maxTokens ||
    params.repetitionPenalty !== DEFAULT_AI_PARAMS.repetitionPenalty ||
    params.systemPrompt !== '' ||
    params.contextLimit !== DEFAULT_AI_PARAMS.contextLimit ||
    params.contextStrategy !== DEFAULT_AI_PARAMS.contextStrategy ||
    params.slidingWindowKeepLast !== DEFAULT_AI_PARAMS.slidingWindowKeepLast ||
    params.factsKeepLast !== DEFAULT_AI_PARAMS.factsKeepLast;

  return { params, setParam, resetParams, hasNonDefaults };
}
