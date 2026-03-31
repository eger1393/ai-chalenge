import { setTokens, getAccessToken, getRefreshToken, clearTokens } from './tokens';
import { AIParams, AppliedParams, DEFAULT_AI_PARAMS, Expert, Role, TestDialogueEvent, TestDialogueParams, Usage } from '@/types/ai-params';
import { Checkpoint, Conversation, ConversationBranch, ConversationDetail, ConversationFact, ConversationMessage, ConversationTotals, ContextWindow } from '@/types/conversation';
import { Task } from '@/types/task';
import { UserProfile } from '@/types/personalization';

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
  conversationId?: string,
) {
  const body: Record<string, unknown> = { message };

  if (conversationId) {
    body.conversationId = conversationId;
  } else {
    body.conversationHistory = conversationHistory;
  }

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
    if (params.contextLimit !== undefined && params.contextLimit > 0) {
      filtered.contextLimit = params.contextLimit;
    }
    if (params.contextStrategy && params.contextStrategy !== 'sliding_window') {
      filtered.contextStrategy = params.contextStrategy;
    }
    filtered.strategyParams = { verbose: true };
    if (Object.keys(filtered).length > 0) {
      body.params = filtered;
    }
  }

  return apiRequest<{ reply: string; usage: Usage; appliedParams?: AppliedParams; cost?: number; durationMs?: number; contextWindow?: ContextWindow; conversationId?: string; conversationTotals?: ConversationTotals; truncation?: { droppedMessages: number; droppedTokens: number }; strategyMetadata?: Record<string, unknown>; assistantMessageId?: string; memoryLayers?: Array<{ type: 'long_term' | 'working' | 'short_term'; label: string; tokenCount: number; content?: string }> }>('/chat/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchRoles(): Promise<Role[]> {
  return apiRequest<Role[]>('/chat/roles');
}

export async function sendConsilium(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  experts: Expert[],
  params?: { model?: string; temperature?: number; maxTokens?: number },
  conversationId?: string,
) {
  const mappedExperts = experts.map((e) => ({
    name: e.name,
    ...(e.mode === 'role' && e.roleId
      ? { roleId: e.roleId }
      : { systemPrompt: e.systemPrompt }),
  }));

  const body: Record<string, unknown> = {
    message,
    experts: mappedExperts,
    ...params,
  };

  if (conversationId) {
    body.conversationId = conversationId;
  } else {
    body.conversationHistory = conversationHistory;
  }

  return apiRequest<{
    reply: string;
    expertOpinions: Array<{ expert: string; reply: string; error?: boolean }>;
    usage: Usage;
    appliedParams?: AppliedParams;
    cost?: number;
    durationMs?: number;
    contextWindow?: ContextWindow;
    conversationId?: string;
    conversationTotals?: ConversationTotals;
    truncation?: { droppedMessages: number; droppedTokens: number };
  }>('/chat/consilium', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createConversation(data?: { title?: string; model?: string; systemPrompt?: string; contextStrategy?: string; taskId?: string }) {
  return apiRequest<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify(data || {}),
  });
}

export async function listConversations(limit = 100) {
  return apiRequest<Conversation[]>(`/conversations?limit=${limit}`);
}

export async function getConversation(id: string) {
  return apiRequest<ConversationDetail>(`/conversations/${id}`);
}

export async function updateConversation(id: string, data: { title?: string }) {
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

// Facts API
export async function getConversationFacts(id: string): Promise<ConversationFact[]> {
  return apiRequest<ConversationFact[]>(`/chat/conversations/${id}/facts`);
}

export async function setConversationFact(id: string, key: string, value: string): Promise<void> {
  await apiRequest<void>(`/chat/conversations/${id}/facts`, {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

export async function deleteConversationFact(id: string, key: string): Promise<void> {
  await apiRequest<void>(`/chat/conversations/${id}/facts/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

// Checkpoints API
export async function createCheckpoint(convId: string, messageId: string, label?: string): Promise<Checkpoint> {
  return apiRequest<Checkpoint>(`/chat/conversations/${convId}/checkpoints`, {
    method: 'POST',
    body: JSON.stringify({ messageId, label: label || undefined }),
  });
}

export async function getCheckpoints(convId: string): Promise<Checkpoint[]> {
  return apiRequest<Checkpoint[]>(`/chat/conversations/${convId}/checkpoints`);
}

// Branches API
export async function getConversationBranches(id: string): Promise<ConversationBranch[]> {
  return apiRequest<ConversationBranch[]>(`/chat/conversations/${id}/branches`);
}

export async function createBranch(convId: string, checkpointId: string, name: string): Promise<ConversationBranch> {
  return apiRequest<ConversationBranch>(`/chat/conversations/${convId}/branches`, {
    method: 'POST',
    body: JSON.stringify({ checkpointId, name }),
  });
}

export async function activateBranch(convId: string, branchId: string): Promise<void> {
  await apiRequest<void>(`/chat/conversations/${convId}/branches/${branchId}/activate`, {
    method: 'POST',
  });
}

export async function deleteBranch(convId: string, branchId: string): Promise<void> {
  await apiRequest<void>(`/chat/conversations/${convId}/branches/${branchId}`, {
    method: 'DELETE',
  });
}

export async function getBranchMessages(convId: string, branchId: string): Promise<ConversationMessage[]> {
  return apiRequest<ConversationMessage[]>(`/chat/conversations/${convId}/branches/${branchId}/messages`);
}

export function startTestDialogue(
  params: TestDialogueParams,
  aiParams?: Partial<AIParams>,
  onEvent?: (event: TestDialogueEvent) => void,
): AbortController {
  const controller = new AbortController();
  const token = getAccessToken();

  const body: Record<string, unknown> = {
    topic: params.topic,
    pairsCount: params.pairsCount,
  };
  if (params.simulatorModel) body.simulatorModel = params.simulatorModel;

  if (aiParams) {
    const filtered: Record<string, unknown> = {};
    if (aiParams.model) filtered.model = aiParams.model;
    if (aiParams.temperature !== undefined) filtered.temperature = aiParams.temperature;
    if (aiParams.maxTokens !== undefined) filtered.maxTokens = aiParams.maxTokens;
    if (aiParams.contextLimit) filtered.contextLimit = aiParams.contextLimit;
    if (aiParams.systemPrompt) filtered.systemPrompt = aiParams.systemPrompt;
    if (aiParams.contextStrategy) filtered.contextStrategy = aiParams.contextStrategy;
    filtered.strategyParams = { verbose: true };
    if (Object.keys(filtered).length > 0) body.params = filtered;
  }

  fetch(`${API_BASE}/chat/test-dialogue`, {
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
      onEvent?.({ type: 'error', message: err.message || 'Request failed' });
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
          try {
            const event = JSON.parse(line.slice(6));
            onEvent?.(event);
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent?.({ type: 'error', message: err.message });
    }
  });

  return controller;
}

export function logout() {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// ===== Tasks API =====
export async function listTasks(status?: string): Promise<Task[]> {
  const query = status ? `?status=${status}` : '';
  return apiRequest<Task[]>(`/tasks${query}`);
}

export async function createTask(data: { title: string; description?: string }): Promise<Task> {
  return apiRequest<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTask(id: string, data: { title?: string; description?: string; status?: string }): Promise<Task> {
  return apiRequest<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTask(id: string): Promise<void> {
  return apiRequest<void>(`/tasks/${id}`, { method: 'DELETE' });
}

export async function setConversationTask(convId: string, taskId: string | null): Promise<void> {
  return apiRequest<void>(`/conversations/${convId}/task`, {
    method: 'PATCH',
    body: JSON.stringify({ taskId }),
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
