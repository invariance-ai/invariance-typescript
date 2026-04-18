import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Severity } from './monitors.js';

export interface Signal {
  id: string;
  agent_id: string;
  monitor_id: string | null;
  monitor_execution_id: string | null;
  run_id: string | null;
  node_id: string | null;
  source: 'monitor' | 'manual';
  severity: Severity;
  title: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  type: string | null;
  data: unknown;
  acknowledged_at: string | null;
  created_at: string;
}

export interface EmitSignalInput {
  severity: Severity;
  title: string;
  message?: string;
  type?: string;
  data?: unknown;
  node_id?: string;
  run_id?: string;
}

export class SignalsResource {
  constructor(private readonly http: HttpClient) {}

  async emit(input: EmitSignalInput): Promise<Signal> {
    const res = await this.http.post<{ signal: Signal }>('/v1/signals', input);
    return res.signal;
  }

  async list(opts?: { cursor?: string; limit?: number }): Promise<ListResponse<Signal>> {
    let path = '/v1/signals';
    const params = new URLSearchParams();
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    if (qs) path += `?${qs}`;
    return this.http.get<ListResponse<Signal>>(path);
  }

  async get(id: string): Promise<Signal> {
    const res = await this.http.get<{ signal: Signal }>(`/v1/signals/${id}`);
    return res.signal;
  }

  async acknowledge(id: string): Promise<Signal> {
    const res = await this.http.patch<{ signal: Signal }>(`/v1/signals/${id}/acknowledge`);
    return res.signal;
  }
}
