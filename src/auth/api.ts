import type { AuthApi, AuthUser, RemoteProfile } from './types';

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

function baseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
}

const authDisabled = import.meta.env.VITE_AUTH_ENABLED !== 'true';
export const isAuthEnabled = !authDisabled;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await window.fetch(`${baseUrl()}${path}`, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new Error('网络请求失败，请检查服务是否已启动');
  }

  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* response without JSON */ }
  if (!response.ok) {
    const data = (typeof payload === 'object' && payload !== null ? payload : {}) as ApiErrorPayload;
    throw new Error(data.message ?? '请求失败，请稍后重试');
  }
  return payload as T;
}

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

export const authApi: AuthApi = {
  async sendCode(channel, contact, purpose) {
    return request<{ expiresInSeconds: number; resendInSeconds: number }>(
      '/api/v1/auth/send-code',
      jsonBody(channel === 'EMAIL' ? { channel, email: contact, purpose } : { channel, phone: contact, purpose }),
    );
  },
  async register(channel, contact, code, displayName) {
    const response = await request<{ user: AuthUser }>(
      '/api/v1/auth/register',
      jsonBody(channel === 'EMAIL' ? { channel, email: contact, code, displayName } : { channel, phone: contact, code, displayName }),
    );
    return response.user;
  },
  async login(channel, contact, code) {
    const response = await request<{ user: AuthUser }>(
      '/api/v1/auth/login',
      jsonBody(channel === 'EMAIL' ? { channel, email: contact, code } : { channel, phone: contact, code }),
    );
    return response.user;
  },
  async logout() { await request<void>('/api/v1/auth/logout', { method: 'POST' }); },
  async me() {
    if (authDisabled) return null;
    try {
      const response = await request<{ user: AuthUser }>('/api/v1/auth/me');
      return response.user;
    } catch {
      return null;
    }
  },
  async getProfile() {
    const response = await request<{ profile: RemoteProfile | null }>('/api/v1/profile');
    return response.profile;
  },
  async saveProfile(profile) {
    const response = await request<{ profile: RemoteProfile }>('/api/v1/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return response.profile;
  },
};
