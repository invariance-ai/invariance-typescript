import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Severity } from './monitors.js';
import { pagePath, type PageOptions } from './query.js';

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

  list(opts: PageOptions = {}): Promise<ListResponse<Finding>> {
    return this.http.get<ListResponse<Finding>>(pagePath('/v1/findings', opts));
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
