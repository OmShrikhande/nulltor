import { get, post, del } from './client';

export type BranchType = 'main' | 'subroom' | 'private';

export interface BranchRead {
  id: string;
  project_id: string;
  name: string;
  type: BranchType;
  parent_branch_id: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BranchList {
  total: number;
  items: BranchRead[];
}

export interface BranchMemberRead {
  id: string;
  branch_id: string;
  user_id: string;
  granted_by: string | null;
  created_at: string;
  username: string | null;
  email: string | null;
}

export const branchesApi = {
  list: (projectId: string) =>
    get<BranchList>(`/projects/${projectId}/branches`),

  get: (projectId: string, branchId: string) =>
    get<BranchRead>(`/projects/${projectId}/branches/${branchId}`),

  create: (projectId: string, data: { name: string; type: BranchType; parent_branch_id?: string }) =>
    post<BranchRead>(`/projects/${projectId}/branches`, data),

  delete: (projectId: string, branchId: string) =>
    del(`/projects/${projectId}/branches/${branchId}`),

  listMembers: (projectId: string, branchId: string) =>
    get<BranchMemberRead[]>(`/projects/${projectId}/branches/${branchId}/members`),

  addMember: (projectId: string, branchId: string, userId: string) =>
    post<BranchMemberRead>(`/projects/${projectId}/branches/${branchId}/members`, { user_id: userId }),

  removeMember: (projectId: string, branchId: string, userId: string) =>
    del(`/projects/${projectId}/branches/${branchId}/members/${userId}`),
};
