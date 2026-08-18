import { get, post } from './client';

export interface CommitResponse {
  id: string;
  project_id: string;
  branch_id: string;
  file_id: string;
  user_id: string | null;
  message: string;
  snapshot: string;
  created_at: string;
  username: string | null;
}

export interface CommitCreate {
  branch_id: string;
  file_id: string;
  message: string;
  snapshot: string;
}

export const commitsApi = {
  getCommits: async (projectId: string, fileId: string, branchId?: string): Promise<CommitResponse[]> => {
    let url = `/projects/${projectId}/commits?file_id=${encodeURIComponent(fileId)}`;
    if (branchId) {
      url += `&branch_id=${encodeURIComponent(branchId)}`;
    }
    return get<CommitResponse[]>(url);
  },
  
  createCommit: async (projectId: string, payload: CommitCreate): Promise<CommitResponse> => {
    return post<CommitResponse>(`/projects/${projectId}/commits`, payload);
  }
};
