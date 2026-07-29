// Typed API client — thin wrapper around fetch with JWT injection
// Mirrors the existing dashboard.js `api()` function but typed

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return localStorage.getItem('nulltor_token');
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('nulltor_token');
    localStorage.removeItem('nulltor_user');
    window.location.hash = '/login';
    throw new ApiError(401, 'Session expired');
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (Array.isArray(data.detail)) {
      msg = data.detail.map((e: { msg: string }) => e.msg).join(', ');
    } else if (data.detail) {
      msg = String(data.detail);
    }
    throw new ApiError(res.status, msg);
  }

  return data as T;
}

export const get = <T>(path: string) => apiRequest<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body);
export const patch = <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body);
export const del = <T = void>(path: string) => apiRequest<T>('DELETE', path);
