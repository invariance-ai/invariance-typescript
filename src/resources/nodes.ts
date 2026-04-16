import type { HttpClient } from '../client.js';
import type { Node, ListResponse } from './runs.js';

export interface WriteNodeInput {
  action_type: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  timestamp?: number;
  duration_ms?: number;
  parent_id?: string;
  previous_hashes?: string[];
  /** Pre-computed signature over the hash. If set, `id`, `timestamp`, and `previous_hashes` must also be set. */
  id?: string;
  signature?: string;
}

export class NodesResource {
  constructor(private readonly http: HttpClient) {}

  async write(sessionId: string, events: WriteNodeInput[]): Promise<Node[]> {
    const body = events.map((e) => ({ session_id: sessionId, ...e }));
    const res = await this.http.post<{ data: Node[] }>('/v1/nodes', body);
    return res.data;
  }

  async list(
    sessionId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<ListResponse<Node>> {
    let path = `/v1/sessions/${sessionId}/nodes`;
    const params = new URLSearchParams();
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    if (qs) path += `?${qs}`;
    return this.http.get<ListResponse<Node>>(path);
  }
}
