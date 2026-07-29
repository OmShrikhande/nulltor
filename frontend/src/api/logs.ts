import { get } from './client';

export interface AuditLogRead {
  id: string;
  actor_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogList {
  total: number;
  page: number;
  page_size: number;
  items: AuditLogRead[];
}

export const logsApi = {
  list: (params?: {
    page?: number;
    page_size?: number;
    project_id?: string;
    branch_id?: string;
    actor_id?: string;
    action?: string;
    resource_type?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.project_id) qs.set('project_id', params.project_id);
    if (params?.branch_id) qs.set('branch_id', params.branch_id);
    if (params?.actor_id) qs.set('actor_id', params.actor_id);
    if (params?.action) qs.set('action', params.action);
    if (params?.resource_type) qs.set('resource_type', params.resource_type);
    return get<AuditLogList>(`/logs?${qs.toString()}`);
  },
};
