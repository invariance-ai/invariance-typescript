import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Severity } from './monitors.js';

export type FindingStatus = 'open' | 'review_requested' | 'resolved' | 'dismissed';

export interface Finding {
  id: string;
  agent_id: string;
  monitor_id: string;
  signal_id: string;
  run_id: string | null;
  node_id: string | null;
  severity: Severity;
  title: string;
  summary: string;
  status: FindingStatus;
  created_at: string;
  updated_at: string;
}

export class FindingsResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: { cursor?: string; limit?: number } = {}): Promise<ListResponse<Finding>> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.http.get<ListResponse<Finding>>(`/v1/findings${qs ? `?${qs}` : ''}`);
  }

  async get(id: string): Promise<Finding> {
    const res = await this.http.get<{ finding: Finding }>(`/v1/findings/${id}`);
    return res.finding;
  }

  async update(id: string, patch: { status: FindingStatus }): Promise<Finding> {
    const res = await this.http.request<{ finding: Finding }>('PATCH', `/v1/findings/${id}`, patch);
    return res.finding;
  }
}
