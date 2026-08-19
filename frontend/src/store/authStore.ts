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
  hydrateTokens: (accessToken: string, refreshToken?: string) => void;
}

const initialToken = localStorage.getItem('nulltor_token');
const initialUserStr = localStorage.getItem('nulltor_user');
const initialUser = initialUserStr ? (JSON.parse(initialUserStr) as UserRead) : null;

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser,
  isAuthenticated: !!(initialToken && initialUser),

  hydrate: () => {
    const token = localStorage.getItem('nulltor_token');
    const userStr = localStorage.getItem('nulltor_user');
    const user = userStr ? (JSON.parse(userStr) as UserRead) : null;
    if (token && user) {
      set({ token, user, isAuthenticated: true });
    }
  },

  hydrateTokens: (accessToken: string, refreshToken?: string) => {
    localStorage.setItem('nulltor_token', accessToken);
    if (refreshToken) localStorage.setItem('nulltor_refresh_token', refreshToken);
    set({ token: accessToken, isAuthenticated: true });
  },

  login: async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('nulltor_token', data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('nulltor_refresh_token', data.refresh_token);
    }
    localStorage.setItem('nulltor_user', JSON.stringify(data.user));
    set({ token: data.access_token, user: data.user, isAuthenticated: true });
    return data.user;
  },

  logout: () => {
    localStorage.removeItem('nulltor_token');
    localStorage.removeItem('nulltor_refresh_token');
    localStorage.removeItem('nulltor_user');
    sessionStorage.clear(); // Ensure E2EE keys don't leak between users on same tab
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
