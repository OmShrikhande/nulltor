// Typed API client — thin wrapper around fetch with JWT injection
// Mirrors the existing dashboard.js `api()` function but typed

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  return localStorage.getItem('nulltor_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('nulltor_refresh_token');
}

/** Decode the `exp` claim from a JWT without verifying signature. */
function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Returns true if the access token expires within the next 5 minutes. */
function isTokenExpiringSoon(): boolean {
  const token = getToken();
  if (!token) return false;
  const exp = getTokenExpiry(token);
  if (exp === null) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec < 300; // less than 5 min remaining
}

let _refreshing: Promise<void> | null = null;

/** Silently exchange the refresh token for a new access + refresh pair. */
async function silentRefresh(): Promise<void> {
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('nulltor_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('nulltor_refresh_token', data.refresh_token);
      }
      // Keep auth store in sync
      try {
        const { useAuthStore } = await import('../store/authStore');
        useAuthStore.getState().hydrateTokens(data.access_token, data.refresh_token);
      } catch {/* ignore circular import edge case */}
    } else {
      // Refresh token itself has expired — force logout
      localStorage.removeItem('nulltor_token');
      localStorage.removeItem('nulltor_refresh_token');
      localStorage.removeItem('nulltor_user');
      sessionStorage.clear();
      window.location.href = '/login';
    }
  })().finally(() => { _refreshing = null; });

  return _refreshing;
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  // Proactively refresh the access token if it's expiring soon (but not on
  // the auth endpoints themselves to avoid infinite loops).
  if (path !== '/auth/login' && path !== '/auth/refresh' && isTokenExpiringSoon()) {
    await silentRefresh();
  }

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

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    // Try one silent refresh before giving up
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await silentRefresh();
      // Retry the original request once with the new token
      const retryToken = getToken();
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (retryToken) retryHeaders['Authorization'] = `Bearer ${retryToken}`;
      const retryRes = await fetch(API_BASE + path, {
        method,
        headers: retryHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (retryRes.status === 401) {
        // Truly expired — log out gracefully
        localStorage.removeItem('nulltor_token');
        localStorage.removeItem('nulltor_refresh_token');
        localStorage.removeItem('nulltor_user');
        sessionStorage.clear();
        window.location.href = '/login';
        throw new ApiError(401, 'Session expired');
      }
      if (retryRes.status === 204) return undefined as T;
      const retryData = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok) {
        const msg = Array.isArray(retryData.detail)
          ? retryData.detail.map((e: { msg: string }) => e.msg).join(', ')
          : String(retryData.detail ?? `HTTP ${retryRes.status}`);
        throw new ApiError(retryRes.status, msg);
      }
      return retryData as T;
    }
    // No refresh token available — redirect to login
    localStorage.removeItem('nulltor_token');
    localStorage.removeItem('nulltor_user');
    sessionStorage.clear();
    window.location.href = '/login';
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
export const put = <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body);
export const patch = <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body);
export const del = <T = void>(path: string) => apiRequest<T>('DELETE', path);
