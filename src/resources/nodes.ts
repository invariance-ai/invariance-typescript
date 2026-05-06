import type { HttpClient } from '../client.js';
import type { Node, ListResponse } from './runs.js';
import type { ArtifactRef } from './artifacts.js';
import { pagePath, type PageOptions } from './query.js';

export interface WriteNodeInput {
  action_type: string;
  /** Declared custom node type (see defineNodeType). Monitors can select on this. */
  type?: string;
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
  /** Binary artifacts (screenshots, DOM snapshots, HAR, video) linked to this node. */
  attachments?: ArtifactRef[];
}

export class NodesResource {
  constructor(private readonly http: HttpClient) {}

  async write(runId: string, events: WriteNodeInput[]): Promise<Node[]> {
    const body = events.map((e) => ({ run_id: runId, ...e }));
    const res = await this.http.post<{ data: Node[] }>('/v1/nodes', body);
    return res.data;
  }

  async list(
    runId: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<Node>> {
    return this.http.get<ListResponse<Node>>(pagePath(`/v1/runs/${runId}/nodes`, opts));
  }
}
