import { get, post } from './client';

export interface CommitResponse {
  id: string;
  project_id: string;
  branch_id: string;
  file_id: string;
  user_id: string | null;
  message: string;
  snapshot: string | null;
  blob_hash: string | null;
  encrypted_patch: string | null;
  parent_delta_id: string | null;
  is_keyframe: boolean;
  chain_depth: number;
  tree_manifest: Record<string, string> | null;
  created_at: string;
  username: string | null;
}

export interface CommitCreate {
  branch_id: string;
  file_id: string;
  message: string;
  snapshot?: string | null;
  blob_hash?: string | null;
  encrypted_patch?: string | null;
  parent_delta_id?: string | null;
  is_keyframe?: boolean;
  chain_depth?: number;
  file_path?: string;
  tree_manifest?: Record<string, string> | null;
}

export interface BlobResponse {
  hash: string;
  ciphertext: string;
  size_bytes: number;
  is_binary: boolean;
  created_at: string;
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
  },

  getBlob: async (projectId: string, blobHash: string): Promise<BlobResponse> => {
    return get<BlobResponse>(`/projects/${projectId}/commits/blobs/${encodeURIComponent(blobHash)}`);
  },
};
