// Typed API client — thin wrapper around fetch with JWT injection and HttpOnly cookie refresh

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
  // Proactively purge any legacy refresh token from localStorage
  if (localStorage.getItem('nulltor_refresh_token')) {
    localStorage.removeItem('nulltor_refresh_token');
  }
  return localStorage.getItem('nulltor_token');
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

let _refreshing: Promise<boolean> | null = null;

/** Silently exchange the HttpOnly refresh token cookie for a new access token and rotate cookies. */
export async function silentRefresh(): Promise<boolean> {
  if (_refreshing) return _refreshing;

  _refreshing = (async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Automatically passes HttpOnly nulltor_refresh_token cookie
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        try {
          localStorage.removeItem('nulltor_token');
          localStorage.removeItem('nulltor_refresh_token');
        } catch {}
        if (data.user) {
          localStorage.setItem('nulltor_user', JSON.stringify(data.user));
        }
        // Keep auth store in sync
        try {
          const { useAuthStore } = await import('../store/authStore');
          useAuthStore.getState().hydrateTokens(data.access_token);
        } catch {/* ignore circular import edge case */}
        return true;
      } else {
        // Refresh token in cookie expired or invalid — clear credentials cleanly
        try {
          localStorage.removeItem('nulltor_token');
          localStorage.removeItem('nulltor_refresh_token');
          localStorage.removeItem('nulltor_user');
        } catch {}
        sessionStorage.clear();
        try {
          const { useAuthStore } = await import('../store/authStore');
          useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
        } catch {}
        if (window.location.hash && window.location.hash !== '#/login') {
          window.location.hash = '#/login';
        }
        return false;
      }
    } catch {
      return false;
    }
  })().finally(() => { _refreshing = null; });

  return _refreshing;
}

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    // Try one silent refresh before giving up
    const refreshed = await silentRefresh();
    if (refreshed) {
      // Retry the original request once with fresh cookies
      const retryRes = await fetch(API_BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (retryRes.status === 204) return undefined as T;
      const retryData = await retryRes.json().catch(() => ({}));
      if (retryRes.ok) {
        return retryData as T;
      }
    }

    // Refresh failed or retry failed — clean up state and route to #/login
    try {
      localStorage.removeItem('nulltor_token');
      localStorage.removeItem('nulltor_refresh_token');
      localStorage.removeItem('nulltor_user');
    } catch {}
    sessionStorage.clear();
    try {
      const { useAuthStore } = await import('../store/authStore');
      useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
    } catch {}
    if (window.location.hash && window.location.hash !== '#/login') {
      window.location.hash = '#/login';
    }
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
