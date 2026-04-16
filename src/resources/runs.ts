import type { HttpClient } from '../client.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  agent_id: string;
  name: string;
  status: 'open' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface Node {
  id: string;
  session_id: string;
  agent_id: string;
  parent_id: string | null;
  action_type: string;
  input: unknown;
  output: unknown;
  error: unknown;
  metadata: Record<string, unknown>;
  timestamp: number;
  duration_ms: number | null;
  hash: string;
  previous_hash: string;
  created_at: string;
}

export interface SessionProof {
  session_id: string;
  valid: boolean;
  node_count: number;
  head_hash: string | null;
  first_invalid_node_id: string | null;
}

export interface ListResponse<T> {
  data: T[];
  next_cursor: string | null;
}

export interface StartRunOptions {
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface WriteNodeOptions {
  action_type: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  timestamp?: number;
  duration_ms?: number;
  parent_id?: string;
}

// ── Run (wraps a session) ──────────────────────────────────────────────────

export class Run {
  constructor(
    private readonly http: HttpClient,
    private readonly session: Session,
  ) {}

  get sessionId(): string {
    return this.session.id;
  }

  get name(): string {
    return this.session.name;
  }

  get status(): string {
    return this.session.status;
  }

  async node(opts: WriteNodeOptions): Promise<Node> {
    const res = await this.http.post<{ data: Node[] }>('/v1/trace/events', {
      session_id: this.session.id,
      action_type: opts.action_type,
      input: opts.input,
      output: opts.output,
      error: opts.error,
      metadata: opts.metadata,
      timestamp: opts.timestamp,
      duration_ms: opts.duration_ms,
      parent_id: opts.parent_id,
    });
    return res.data[0];
  }

  async verify(): Promise<SessionProof> {
    return this.http.get<SessionProof>(`/v1/sessions/${this.session.id}/verify`);
  }

  async finish(): Promise<Session> {
    const res = await this.http.patch<{ session: Session }>(
      `/v1/sessions/${this.session.id}`,
      { status: 'completed' },
    );
    return res.session;
  }

  async fail(error?: string): Promise<Session> {
    const res = await this.http.patch<{ session: Session }>(
      `/v1/sessions/${this.session.id}`,
      { status: 'failed', metadata: error ? { error } : undefined },
    );
    return res.session;
  }
}

// ── Runs resource ──────────────────────────────────────────────────────────

export class RunsResource {
  constructor(private readonly http: HttpClient) {}

  async start(opts: StartRunOptions = {}): Promise<Run> {
    const res = await this.http.post<{ session: Session }>('/v1/sessions', {
      name: opts.name,
      metadata: opts.metadata,
    });
    return new Run(this.http, res.session);
  }

  async list(opts?: { cursor?: string; limit?: number }): Promise<ListResponse<Session>> {
    let path = '/v1/sessions';
    const params = new URLSearchParams();
    if (opts?.cursor) params.set('cursor', opts.cursor);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    if (qs) path += `?${qs}`;
    return this.http.get<ListResponse<Session>>(path);
  }

  async get(id: string): Promise<Run> {
    const res = await this.http.get<{ session: Session }>(`/v1/sessions/${id}`);
    return new Run(this.http, res.session);
  }
}
