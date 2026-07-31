import { get, post, patch, del } from './client';

export type ProjectStatus = 'live' | 'offline' | 'completed';

export interface ProjectRead {
  id: string;
  name: string;
  description: string | null;
  status?: ProjectStatus | string;
  owner_id: string;
  room_salt: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectList {
  total: number;
  items: ProjectRead[];
}

export const projectsApi = {
  list: (skip = 0, limit = 50) =>
    get<ProjectList>(`/projects?skip=${skip}&limit=${limit}`),

  get: (id: string) => get<ProjectRead>(`/projects/${id}`),

  create: (name: string, description?: string, status?: string) =>
    post<ProjectRead>('/projects', { name, description, status }),

  update: (id: string, data: Partial<{ name: string; description: string; status: string; room_salt: string }>) =>
    patch<ProjectRead>(`/projects/${id}`, data),

  delete: (id: string) => del(`/projects/${id}`),
};
