import { create } from 'zustand';
import { authApi, type UserRead } from '../api/auth';

interface AuthState {
  token: string | null;
  user: UserRead | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<UserRead>;
  logout: () => void;
  hydrate: () => void;
  /** Called by the API client after a silent token refresh to keep state in sync. */
  hydrateTokens: (accessToken: string) => void;
}

// Ensure no legacy refresh token persists in localStorage
try {
  localStorage.removeItem('nulltor_refresh_token');
} catch {}

const initialToken = localStorage.getItem('nulltor_token');
const initialUserStr = localStorage.getItem('nulltor_user');
const initialUser = initialUserStr ? (JSON.parse(initialUserStr) as UserRead) : null;

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser,
  isAuthenticated: !!(initialToken && initialUser),

  hydrate: async () => {
    try {
      localStorage.removeItem('nulltor_refresh_token');
      localStorage.removeItem('nulltor_token');
    } catch {}

    const userStr = localStorage.getItem('nulltor_user');
    const cachedUser = userStr ? (JSON.parse(userStr) as UserRead) : null;
    if (cachedUser) {
      set({ user: cachedUser, isAuthenticated: true });
    }

    try {
      // Validate session with backend using HTTP-Only cookies
      const me = await authApi.me();
      localStorage.setItem('nulltor_user', JSON.stringify(me));
      set({ user: me, isAuthenticated: true });
    } catch {
      // If authApi.me() failed, apiRequest already attempted silentRefresh().
      // Clear user session cleanly.
      localStorage.removeItem('nulltor_user');
      sessionStorage.clear();
      set({ token: null, user: null, isAuthenticated: false });
    }
  },

  hydrateTokens: (accessToken: string) => {
    try {
      localStorage.removeItem('nulltor_token');
      localStorage.removeItem('nulltor_refresh_token');
    } catch {}
    set({ token: accessToken, isAuthenticated: true });
  },

  login: async (email, password) => {
    const data = await authApi.login(email, password);
    try {
      localStorage.removeItem('nulltor_token');
      localStorage.removeItem('nulltor_refresh_token');
    } catch {}
    localStorage.setItem('nulltor_user', JSON.stringify(data.user));
    set({ token: data.access_token, user: data.user, isAuthenticated: true });
    return data.user;
  },

  logout: () => {
    authApi.logout().catch(() => {});
    try {
      localStorage.removeItem('nulltor_token');
      localStorage.removeItem('nulltor_refresh_token');
      localStorage.removeItem('nulltor_user');
    } catch {}
    sessionStorage.clear(); // Ensure E2EE keys don't leak between users on same tab
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
