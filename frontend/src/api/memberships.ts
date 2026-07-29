import { get, post, del } from './client';
import { type UserRead } from './auth';

export interface MembershipRead {
  id: string;
  project_id: string;
  user_id: string;
  role: 'lead' | 'member';
  created_at: string;
}

export interface MembershipWithUser extends MembershipRead {
  username: string;
  email: string;
  user_is_active: boolean;
}

export interface MembershipInviteResponse {
  message: string;
  membership: MembershipRead;
  temp_password?: string;
}

export const membershipsApi = {
  list: (projectId: string) =>
    get<MembershipWithUser[]>(`/projects/${projectId}/members`),

  add: (projectId: string, email: string, role: 'lead' | 'member' = 'member') =>
    post<MembershipInviteResponse>(`/projects/${projectId}/members`, { email, role }),

  remove: (projectId: string, userId: string) =>
    del(`/projects/${projectId}/members/${userId}`),
};
