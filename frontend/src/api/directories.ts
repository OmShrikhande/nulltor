import { get, post, del, patch } from './client';

export type NodeType = 'file' | 'dir';

export interface DirectoryNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  branch_id: string | null;
  name: string;
  type: NodeType;
  snapshot_path: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  children?: DirectoryNode[];
}

export const directoriesApi = {
  tree: (projectId: string, branchId?: string) => {
    const qs = branchId ? `?branch_id=${branchId}` : '';
    return get<DirectoryNode[]>(`/projects/${projectId}/tree${qs}`);
  },

  create: (
    projectId: string,
    data: { name: string; type: NodeType; parent_id?: string },
    branchId?: string
  ) => {
    const qs = branchId ? `?branch_id=${branchId}` : '';
    return post<DirectoryNode>(`/projects/${projectId}/tree${qs}`, data);
  },

  rename: (projectId: string, nodeId: string, data: { name?: string; parent_id?: string }) =>
    patch<DirectoryNode>(`/projects/${projectId}/tree/${nodeId}`, data),

  delete: (projectId: string, nodeId: string) =>
    del(`/projects/${projectId}/tree/${nodeId}`),
};
