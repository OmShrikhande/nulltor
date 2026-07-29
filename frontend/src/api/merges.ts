import { get, post } from './client';

export type MergeStatus = 'pending' | 'approved' | 'rejected';

export interface MergeRequestRead {
  id: string;
  project_id: string;
  source_branch_id: string;
  target_branch_id: string;
  file_id: string;
  requested_by: string | null;
  reviewed_by: string | null;
  status: MergeStatus;
  detail: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MergeSnapshotResponse {
  merge_request_id: string;
  pre_merge_snapshot: string | null;
  source_snapshot: string | null;
}

export const mergesApi = {
  list: (projectId: string, status?: MergeStatus) => {
    const qs = status ? `?merge_status=${status}` : '';
    return get<MergeRequestRead[]>(`/projects/${projectId}/merges${qs}`);
  },

  get: (projectId: string, mergeId: string) =>
    get<MergeRequestRead>(`/projects/${projectId}/merges/${mergeId}`),

  create: (projectId: string, data: {
    source_branch_id: string;
    target_branch_id: string;
    file_id: string;
    pre_merge_snapshot?: string;
    detail?: Record<string, unknown>;
  }) => post<MergeRequestRead>(`/projects/${projectId}/merges`, data),

  getSnapshots: (projectId: string, mergeId: string) =>
    get<MergeSnapshotResponse>(`/projects/${projectId}/merges/${mergeId}/snapshots`),

  review: (projectId: string, mergeId: string, status: 'approved' | 'rejected', detail?: Record<string, unknown>) =>
    post<MergeRequestRead>(`/projects/${projectId}/merges/${mergeId}/review`, { status, detail }),

  confirm: (projectId: string, mergeId: string, mergedSnapshot: string) =>
    post<MergeRequestRead>(`/projects/${projectId}/merges/${mergeId}/confirm`, { merged_snapshot: mergedSnapshot }),
};
