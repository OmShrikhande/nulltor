import { get, post, patch, del } from './client';

export type ProjectStatus = 'live' | 'offline' | 'completed';

export interface ProjectRead {
  id: string;
  name: string;
  description: string | null;
  status?: ProjectStatus | string;
  owner_id: string;
  room_salt: string | null;
  invite_code: string | null;
  invite_role: string;
  is_active: boolean;
  passphrase_set?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectList {
  total: number;
  items: ProjectRead[];
}

export interface SnapshotItem {
  file_id: string;
  branch_id: string;
  data: string;
}

export interface CommitItem {
  id: string;
  snapshot: string;
}

export interface EncryptedDataResponse {
  snapshots: SnapshotItem[];
  commits: CommitItem[];
}

export interface PassphraseMigrate {
  old_passphrase: string;
  new_passphrase: string;
  snapshots?: SnapshotItem[];
  commits?: CommitItem[];
  new_snapshots?: SnapshotItem[];
  new_commits?: CommitItem[];
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

  joinByCode: (code: string) =>
    post<ProjectRead>(`/projects/join/${code.toUpperCase().trim()}`, {}),

  regenerateCode: (id: string, invite_role?: string) =>
    post<ProjectRead>(`/projects/${id}/regenerate-code`, { invite_role }),

  resetPassphrase: (id: string, passphrase: string) =>
    post<{ status: string; message: string }>(`/projects/${id}/reset-passphrase`, { passphrase }),

  getEncryptedData: (id: string) =>
    get<EncryptedDataResponse>(`/projects/${id}/encrypted-data`),

  migratePassphrase: (id: string, payload: PassphraseMigrate) =>
    post<ProjectRead>(`/projects/${id}/migrate-passphrase`, payload),
};
