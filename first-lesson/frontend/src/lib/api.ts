import { setTokens, getAccessToken, getRefreshToken, clearTokens } from './tokens';
import { AIParams, AppliedParams, DEFAULT_AI_PARAMS } from '@/types/ai-params';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiRequest<T>(path, options, false);
    }
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || res.statusText);
  }

  return res.json();
}

export async function login(username: string, password: string) {
  const data = await apiRequest<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function getMe() {
  return apiRequest<{ username: string; role: string }>('/auth/me');
}

export async function sendMessage(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  params?: Partial<AIParams>,
) {
  const body: Record<string, unknown> = { message, conversationHistory };

  if (params) {
    const filtered: Record<string, unknown> = {};
    if (params.model !== undefined && params.model !== DEFAULT_AI_PARAMS.model) {
      filtered.model = params.model;
    }
    if (params.temperature !== undefined && params.temperature !== DEFAULT_AI_PARAMS.temperature) {
      filtered.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined && params.maxTokens !== DEFAULT_AI_PARAMS.maxTokens) {
      filtered.maxTokens = params.maxTokens;
    }
    if (params.repetitionPenalty !== undefined && params.repetitionPenalty !== DEFAULT_AI_PARAMS.repetitionPenalty) {
      filtered.repetitionPenalty = params.repetitionPenalty;
    }
    if (params.systemPrompt !== undefined && params.systemPrompt !== '') {
      filtered.systemPrompt = params.systemPrompt;
    }
    if (Object.keys(filtered).length > 0) {
      body.params = filtered;
    }
  }

  return apiRequest<{ reply: string; usage: unknown; appliedParams?: AppliedParams }>('/chat/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sendConsilium(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  experts: Array<{ name: string; systemPrompt: string }>,
  params?: { model?: string; temperature?: number; maxTokens?: number },
) {
  return apiRequest<{
    reply: string;
    expertOpinions: Array<{ expert: string; reply: string; error?: boolean }>;
    usage: unknown;
    appliedParams?: AppliedParams;
  }>('/chat/consilium', {
    method: 'POST',
    body: JSON.stringify({
      message,
      conversationHistory,
      experts,
      ...params,
    }),
  });
}

export function logout() {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
