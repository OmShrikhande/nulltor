import { get, post } from './client';

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  user: UserRead;
}

export interface UserRead {
  id: string;
  email: string;
  username: string;
  role: 'superadmin' | 'admin' | 'member';
  is_active: boolean;
  requires_password_change: boolean;
  created_at: string;
  updated_at: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    post<LoginResponse>('/auth/login', { email, password }),

  me: () => get<UserRead>('/auth/me'),

  changePassword: (old_password: string, new_password: string) =>
    post<{ message: string }>('/auth/change-password', { old_password, new_password }),

  logout: () => post<{ message: string }>('/auth/logout'),
};
