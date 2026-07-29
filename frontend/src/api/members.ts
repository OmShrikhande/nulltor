import { get, post, del } from './client';

export interface MembershipWithUser {
  id: string;
  user_id: string;
  project_id: string;
  role: 'lead' | 'member';
  granted_by: string | null;
  created_at: string;
  username: string;
  email: string;
  user_is_active: boolean;
}

export interface MembershipInviteResponse {
  membership: {
    id: string;
    user_id: string;
    project_id: string;
    role: string;
    granted_by: string | null;
    created_at: string;
  };
  temp_password: string | null;
}

export const membersApi = {
  list: (projectId: string) =>
    get<MembershipWithUser[]>(`/projects/${projectId}/members`),

  add: (projectId: string, email: string, role: 'lead' | 'member') =>
    post<MembershipInviteResponse>(`/projects/${projectId}/members`, { email, role }),

  remove: (projectId: string, userId: string) =>
    del(`/projects/${projectId}/members/${userId}`),
};
