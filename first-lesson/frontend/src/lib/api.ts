import { setTokens, getAccessToken, getRefreshToken, clearTokens } from './tokens';
import { AIParams } from '@/types/ai-params';
import { Conversation, ConversationDetail, ConversationFact, ConversationMessage, MessageDebugData } from '@/types/conversation';
import { Project, ProjectInvariant } from '@/types/task';
import { UserProfile } from '@/types/personalization';
import { PipelineSSEEvent } from '@/types/pipeline';
import { IssueSubscription, IssueNotification } from '@/types/notification';

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

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

// ===== Auth =====

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

export function logout() {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// ===== Projects API (бывший Tasks) =====

export async function listProjects(status?: string): Promise<Project[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<Project[]>(`/projects${query}`);
}

export async function createProject(data: { title: string; description?: string }): Promise<Project> {
  return apiRequest<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: { title?: string; description?: string; status?: string }): Promise<Project> {
  return apiRequest<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
}

// ===== Project Invariants API =====

export async function getProjectInvariants(projectId: string): Promise<ProjectInvariant[]> {
  return apiRequest<ProjectInvariant[]>(`/projects/${projectId}/invariants`);
}

export async function addProjectInvariant(projectId: string, content: string): Promise<ProjectInvariant> {
  return apiRequest<ProjectInvariant>(`/projects/${projectId}/invariants`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function removeProjectInvariant(projectId: string, invariantId: string): Promise<void> {
  return apiRequest<void>(`/projects/${projectId}/invariants/${invariantId}`, { method: 'DELETE' });
}

// ===== Conversations API =====

export async function createConversation(data: {
  projectId: string;
  title?: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  repetitionPenalty?: number;
  contextLimit?: number;
  ragEnabled?: boolean;
  ragQueryRewriteEnabled?: boolean;
  ragMode?: 'filter' | 'reranker';
  contextStrategy?: string;
}) {
  return apiRequest<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listConversations(projectId: string, limit = 100) {
  return apiRequest<Conversation[]>(`/conversations?projectId=${projectId}&limit=${limit}`);
}

export async function getConversation(id: string) {
  return apiRequest<ConversationDetail>(`/conversations/${id}`);
}

export async function updateConversation(id: string, data: {
  title?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  repetitionPenalty?: number;
  contextLimit?: number;
  ragEnabled?: boolean;
  ragQueryRewriteEnabled?: boolean;
  ragMode?: 'filter' | 'reranker';
  systemPrompt?: string;
  model?: string;
}) {
  return apiRequest<Conversation>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteConversation(id: string) {
  return apiRequest<void>(`/conversations/${id}`, {
    method: 'DELETE',
  });
}

// ===== Facts API =====

export async function getConversationFacts(id: string): Promise<ConversationFact[]> {
  return apiRequest<ConversationFact[]>(`/conversations/${id}/facts`);
}

export async function setConversationFact(id: string, key: string, value: string): Promise<void> {
  await apiRequest<void>(`/conversations/${id}/facts`, {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  });
}

export async function deleteConversationFact(id: string, key: string): Promise<void> {
  await apiRequest<void>(`/conversations/${id}/facts/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

// ===== Context API =====

export async function getConversationContext(id: string) {
  return apiRequest<any>(`/conversations/${id}/context`);
}

export async function updateConversationContext(
  id: string,
  data: { strategyType?: string; strategyData?: Record<string, unknown> },
) {
  return apiRequest<{ success: boolean }>(`/conversations/${id}/context`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ===== Profile API =====

export async function getProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>('/profile');
}

export async function updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
  return apiRequest<UserProfile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ===== Messages API (бывший Pipeline) =====

export function startMessages(
  conversationId: string,
  message: string,
  params?: Partial<AIParams>,
  onEvent?: (event: PipelineSSEEvent) => void,
): AbortController {
  const controller = new AbortController();
  const token = getAccessToken();

  const body: Record<string, unknown> = { message };
  if (params) {
    const filtered: Record<string, unknown> = {};
    if (params.provider) filtered.provider = params.provider;
    if (params.model) filtered.model = params.model;
    if (params.temperature !== undefined) filtered.temperature = params.temperature;
    if (params.maxTokens !== undefined) filtered.maxTokens = params.maxTokens;
    if (params.systemPrompt) filtered.systemPrompt = params.systemPrompt;
    if (params.contextLimit !== undefined) filtered.contextLimit = params.contextLimit;
    if (params.ragEnabled !== undefined) filtered.ragEnabled = params.ragEnabled;
    if (params.ragQueryRewriteEnabled !== undefined) filtered.ragQueryRewriteEnabled = params.ragQueryRewriteEnabled;
    if (params.ragMode !== undefined) filtered.ragMode = params.ragMode;
    if (params.contextStrategy) filtered.contextStrategy = params.contextStrategy;
    if (Object.keys(filtered).length > 0) body.params = filtered;
  }

  fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      onEvent?.({ type: 'error', error: err.message || 'Request failed' });
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { onEvent?.(JSON.parse(line.slice(6))); } catch { /* ignore */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent?.({ type: 'error', error: err.message });
    }
  });

  return controller;
}

export async function pauseMessage(messageId: string): Promise<void> {
  await apiRequest<void>(`/messages/${messageId}/pause`, { method: 'POST' });
}

export function resumeMessage(
  messageId: string,
  onEvent?: (event: PipelineSSEEvent) => void,
): AbortController {
  const controller = new AbortController();
  const token = getAccessToken();

  fetch(`${API_BASE}/messages/${messageId}/resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      onEvent?.({ type: 'error', error: err.message || 'Resume failed' });
      return;
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { onEvent?.(JSON.parse(line.slice(6))); } catch { /* ignore */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent?.({ type: 'error', error: err.message });
    }
  });

  return controller;
}

export async function cancelMessage(messageId: string): Promise<void> {
  await apiRequest<void>(`/messages/${messageId}/cancel`, { method: 'POST' });
}

export async function getMessageDetails(messageId: string) {
  return apiRequest<ConversationMessage>(`/messages/${messageId}`);
}

export async function getMessageDebug(messageId: string) {
  return apiRequest<MessageDebugData>(`/messages/${messageId}/debug`);
}

// ===== Subscriptions =====

export async function getSubscriptions(): Promise<IssueSubscription[]> {
  return apiRequest<IssueSubscription[]>('/subscriptions');
}

export async function getConversationSubscriptions(
  conversationId: string,
): Promise<IssueSubscription[]> {
  return apiRequest<IssueSubscription[]>(
    `/conversations/${conversationId}/subscriptions`,
  );
}

// ===== Notifications =====

export async function getNotifications(
  conversationId: string,
  limit = 50,
  offset = 0,
): Promise<{ notifications: IssueNotification[]; unreadCount: number }> {
  return apiRequest<{ notifications: IssueNotification[]; unreadCount: number }>(
    `/notifications?conversationId=${conversationId}&limit=${limit}&offset=${offset}`,
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  return apiRequest<void>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(
  conversationId: string,
): Promise<void> {
  return apiRequest<void>(`/notifications/read-all`, {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });
}
