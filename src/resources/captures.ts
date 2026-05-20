import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import { withQuery, type PageOptions } from './query.js';
import type {
  AgentSession,
  AgentSessionSource,
  AgentSessionType,
  CreateAgentSessionRequest,
} from './sessions.js';

/** Alias for AgentSession — captures are the same entity served at /v1/captures. */
export type Capture = AgentSession & { run_id?: string | null };

export interface ListCapturesOptions extends PageOptions {
  project_id?: string;
  operator_id?: string;
  session_type?: AgentSessionType;
  source?: AgentSessionSource;
  run_id?: string;
}

export interface UpdateCaptureOptions {
  run_id?: string | null;
  status?: string;
  agent_id?: string | null;
}

/**
 * Thin client over /v1/captures. Captures are the canonical ingestion surface
 * for raw agent sessions before they are linked to a run/case. Linking is done
 * by setting run_id via update() or the link/unlink convenience methods.
 */
export class CapturesResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateAgentSessionRequest): Promise<Capture> {
    const res = await this.http.post<{ session: Capture }>('/v1/captures', input);
    return res.session;
  }

  async get(id: string): Promise<Capture> {
    const res = await this.http.get<{ session: Capture }>(`/v1/captures/${id}`);
    return res.session;
  }

  async list(opts: ListCapturesOptions = {}): Promise<ListResponse<Capture>> {
    return this.http.get<ListResponse<Capture>>(
      withQuery('/v1/captures', {
        project_id: opts.project_id,
        operator_id: opts.operator_id,
        session_type: opts.session_type,
        source: opts.source,
        run_id: opts.run_id,
        cursor: opts.cursor,
        limit: opts.limit,
      }),
    );
  }

  async update(id: string, patch: UpdateCaptureOptions): Promise<Capture> {
    const res = await this.http.patch<{ session: Capture }>(`/v1/captures/${id}`, patch);
    return res.session;
  }

  /** Link a capture to a run by setting run_id. */
  async link(id: string, { run_id }: { run_id: string }): Promise<Capture> {
    const res = await this.http.patch<{ session: Capture }>(`/v1/captures/${id}`, { run_id });
    return res.session;
  }

  /** Unlink a capture from its run by setting run_id to null. */
  async unlink(id: string): Promise<Capture> {
    const res = await this.http.patch<{ session: Capture }>(`/v1/captures/${id}`, { run_id: null });
    return res.session;
  }

  /** Return the run_id this capture is linked to, or null if unlinked. */
  async listLinks(id: string): Promise<{ run_id: string | null }> {
    const capture = await this.get(id);
    return { run_id: capture.run_id ?? null };
  }
}
