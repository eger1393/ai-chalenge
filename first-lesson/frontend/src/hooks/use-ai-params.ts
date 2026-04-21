'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AIParams,
  DEFAULT_AI_PARAMS,
  getDefaultModelForProvider,
  inferProviderFromModel,
  isAIProvider,
  isModelSupportedByProvider,
  type RagMode,
} from '@/types/ai-params';

const STORAGE_KEY = 'aiParams';

function normalizeParams(parsed: Record<string, unknown>, fallback: AIParams = DEFAULT_AI_PARAMS): AIParams {
  const provider = isAIProvider(parsed.provider)
    ? parsed.provider
    : inferProviderFromModel(parsed.model) ?? fallback.provider;
  const model = isModelSupportedByProvider(provider, parsed.model)
    ? parsed.model
    : getDefaultModelForProvider(provider);

  return {
    provider,
    model,
    temperature: typeof parsed.temperature === 'number' ? parsed.temperature : fallback.temperature,
    maxTokens: typeof parsed.maxTokens === 'number' ? parsed.maxTokens : fallback.maxTokens,
    repetitionPenalty: typeof parsed.repetitionPenalty === 'number' ? parsed.repetitionPenalty : fallback.repetitionPenalty,
    systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : fallback.systemPrompt,
    contextLimit: typeof parsed.contextLimit === 'number' ? parsed.contextLimit : fallback.contextLimit,
    ragEnabled: typeof parsed.ragEnabled === 'boolean' ? parsed.ragEnabled : fallback.ragEnabled,
    ragQueryRewriteEnabled:
      typeof parsed.ragQueryRewriteEnabled === 'boolean'
        ? parsed.ragQueryRewriteEnabled
        : fallback.ragQueryRewriteEnabled,
    ragMode: parsed.ragMode === 'reranker' ? 'reranker' : fallback.ragMode,
    contextStrategy:
      typeof parsed.contextStrategy === 'string' && ['sliding_window', 'sticky_facts'].includes(parsed.contextStrategy)
        ? (parsed.contextStrategy as AIParams['contextStrategy'])
        : fallback.contextStrategy,
    slidingWindowKeepLast:
      typeof parsed.slidingWindowKeepLast === 'number' ? parsed.slidingWindowKeepLast : fallback.slidingWindowKeepLast,
  };
}

function loadFromStorage(): AIParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Migration: old summaryMode/summaryKeepLast -> new contextStrategy/slidingWindowKeepLast
    let contextStrategy = DEFAULT_AI_PARAMS.contextStrategy;
    let slidingWindowKeepLast = DEFAULT_AI_PARAMS.slidingWindowKeepLast;

    if ('summaryMode' in parsed) {
      contextStrategy = 'sliding_window';
      slidingWindowKeepLast = typeof parsed.summaryKeepLast === 'number' ? parsed.summaryKeepLast : 10;
    } else {
      if (typeof parsed.contextStrategy === 'string' && ['sliding_window', 'sticky_facts'].includes(parsed.contextStrategy)) {
        contextStrategy = parsed.contextStrategy;
      }
      if (typeof parsed.slidingWindowKeepLast === 'number') {
        slidingWindowKeepLast = parsed.slidingWindowKeepLast;
      }
    }

    return normalizeParams({
      ...parsed,
      contextStrategy,
      slidingWindowKeepLast,
    });
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

function loadStoredRagConfig(): { ragEnabled: boolean; ragMode: RagMode; ragQueryRewriteEnabled: boolean } {
  const stored = loadFromStorage();
  if (!stored) {
    return {
      ragEnabled: DEFAULT_AI_PARAMS.ragEnabled,
      ragQueryRewriteEnabled: DEFAULT_AI_PARAMS.ragQueryRewriteEnabled,
      ragMode: DEFAULT_AI_PARAMS.ragMode,
    };
  }

  return {
    ragEnabled: stored.ragEnabled,
    ragQueryRewriteEnabled: stored.ragQueryRewriteEnabled,
    ragMode: stored.ragMode,
  };
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

  const hydrateConversationParams = useCallback((next: Partial<AIParams>) => {
    setParams((prev) => {
      const merged = normalizeParams(next as Record<string, unknown>, prev);
      return {
        ...prev,
        ...merged,
      };
    });
  }, []);

  const restoreStoredParams = useCallback(() => {
    const stored = loadFromStorage();
    setParams(stored ?? DEFAULT_AI_PARAMS);
  }, []);

  const setConversationRagConfig = useCallback((
    ragEnabled: boolean,
    ragMode: RagMode,
    ragQueryRewriteEnabled: boolean,
  ) => {
    setParams((prev) => ({
      ...prev,
      ragEnabled,
      ragQueryRewriteEnabled,
      ragMode,
    }));
  }, []);

  const restoreStoredRagConfig = useCallback(() => {
    const stored = loadStoredRagConfig();
    setParams((prev) => ({
      ...prev,
      ragEnabled: stored.ragEnabled,
      ragQueryRewriteEnabled: stored.ragQueryRewriteEnabled,
      ragMode: stored.ragMode,
    }));
  }, []);

  const hasNonDefaults =
    params.provider !== DEFAULT_AI_PARAMS.provider ||
    params.model !== DEFAULT_AI_PARAMS.model ||
    params.temperature !== DEFAULT_AI_PARAMS.temperature ||
    params.maxTokens !== DEFAULT_AI_PARAMS.maxTokens ||
    params.repetitionPenalty !== DEFAULT_AI_PARAMS.repetitionPenalty ||
    params.systemPrompt !== '' ||
    params.contextLimit !== DEFAULT_AI_PARAMS.contextLimit ||
    params.ragEnabled !== DEFAULT_AI_PARAMS.ragEnabled ||
    params.ragQueryRewriteEnabled !== DEFAULT_AI_PARAMS.ragQueryRewriteEnabled ||
    params.ragMode !== DEFAULT_AI_PARAMS.ragMode ||
    params.contextStrategy !== DEFAULT_AI_PARAMS.contextStrategy ||
    params.slidingWindowKeepLast !== DEFAULT_AI_PARAMS.slidingWindowKeepLast;

  return {
    params,
    setParam,
    resetParams,
    hydrateConversationParams,
    restoreStoredParams,
    hasNonDefaults,
    setConversationRagConfig,
    restoreStoredRagConfig,
  };
}
