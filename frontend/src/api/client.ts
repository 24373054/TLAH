import type {
  ChatSummary,
  ChatDetail,
  Chat,
  SendMessageResponse,
  QueueMessageResponse,
  RawRequestData,
  RawResponseData,
  GlobalSettings,
  GlobalSettingsUpdate,
  ChatSettings,
  ChatSettingsUpdate,
  AgentFileData,
  ProviderInfo,
} from '../types';

class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.name = 'ApiError';
  }
}

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Chats ──────────────────────────────────────────────────────────

export function createChat(title?: string): Promise<Chat> {
  return request('/chats', {
    method: 'POST',
    body: JSON.stringify({ title: title ?? 'New Chat' }),
  });
}

export function listChats(): Promise<ChatSummary[]> {
  return request('/chats');
}

export function getChat(id: string): Promise<ChatDetail> {
  return request(`/chats/${id}`);
}

export function updateChat(id: string, data: { title?: string; system_prompt?: string }): Promise<Chat> {
  return request(`/chats/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteChat(id: string): Promise<void> {
  return request(`/chats/${id}`, { method: 'DELETE' });
}

// ── Messages ───────────────────────────────────────────────────────

export function sendMessage(chatId: string, content: string, role?: string): Promise<SendMessageResponse> {
  return request(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, ...(role ? { role } : {}) }),
  });
}

// ── Async harness: queue message without triggering LLM ──────────────

export function queueMessage(chatId: string, content: string, role?: string): Promise<QueueMessageResponse> {
  return request(`/chats/${chatId}/messages/queue`, {
    method: 'POST',
    body: JSON.stringify({ content, ...(role ? { role } : {}) }),
  });
}

// ── Debug ──────────────────────────────────────────────────────────

export function getRawRequest(turnId: string): Promise<RawRequestData> {
  return request(`/turns/${turnId}/raw-request`);
}

export function getRawResponse(turnId: string): Promise<RawResponseData> {
  return request(`/turns/${turnId}/raw-response`);
}

// ── Providers ──────────────────────────────────────────────────────

export function listProviders(): Promise<ProviderInfo[]> {
  return request('/providers');
}

// ── Global Settings ────────────────────────────────────────────────

export function getGlobalSettings(): Promise<GlobalSettings> {
  return request('/settings');
}

export function updateGlobalSettings(data: GlobalSettingsUpdate): Promise<GlobalSettings> {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Chat Settings ──────────────────────────────────────────────────

export function getChatSettings(chatId: string): Promise<ChatSettings> {
  return request(`/chats/${chatId}/settings`);
}

export function updateChatSettings(chatId: string, data: ChatSettingsUpdate): Promise<ChatSettings> {
  return request(`/chats/${chatId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Agent File ─────────────────────────────────────────────────────

export function uploadAgentFile(chatId: string, file: File): Promise<AgentFileData> {
  const formData = new FormData();
  formData.append('file', file);
  return request(`/chats/${chatId}/agent-file`, {
    method: 'POST',
    headers: {}, // Let browser set Content-Type for multipart
    body: formData,
  });
}

export function getAgentFile(chatId: string): Promise<AgentFileData> {
  return request(`/chats/${chatId}/agent-file`);
}

export function deleteAgentFile(chatId: string): Promise<void> {
  return request(`/chats/${chatId}/agent-file`, { method: 'DELETE' });
}
