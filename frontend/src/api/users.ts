import { get, post, put, patch, del } from './client';
import { type UserRead } from './auth';

export interface UserCreate {
  email: string;
  username: string;
  password?: string;
  role: 'superadmin' | 'admin' | 'member';
}

export interface UserUpdate {
  email?: string;
  username?: string;
  password?: string;
  role?: 'superadmin' | 'admin' | 'member';
  is_active?: boolean;
}

export interface UserList {
  total: number;
  items: UserRead[];
}

export const usersApi = {
  search: (q?: string) =>
    get<{ email: string; username: string }[]>(q ? `/users/search?q=${encodeURIComponent(q)}` : '/users/search'),

  list: (skip = 0, limit = 50) =>
    get<UserList>(`/users?skip=${skip}&limit=${limit}`),

  create: (data: UserCreate) =>
    post<UserRead>('/users', data),

  update: (id: string, data: UserUpdate) =>
    patch<UserRead>(`/users/${id}`, data),

  deactivate: (id: string) =>
    del(`/users/${id}`),

  getPreferences: () =>
    get<Record<string, any>>('/users/me/preferences'),

  updatePreferences: (preferences: Record<string, any>) =>
    put<Record<string, any>>('/users/me/preferences', preferences),
};
