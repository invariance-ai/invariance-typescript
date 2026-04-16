import type { HttpClient } from '../client.js';
import { hashNodePayload, signEd25519, type NodeHashPayload } from '../crypto.js';

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
  custom_fields: Record<string, unknown>;
  timestamp: number;
  duration_ms: number | null;
  hash: string;
  previous_hashes: string[];
  signature: string | null;
  created_at: string;
}

export type SessionProofReason = 'linkage' | 'hash' | 'signature' | 'missing_key';

export interface SessionProof {
  session_id: string;
  valid: boolean;
  node_count: number;
  head_hash: string | null;
  first_invalid_node_id: string | null;
  reason: SessionProofReason | null;
}

export interface ListResponse<T> {
  data: T[];
  next_cursor: string | null;
}

export interface StartRunOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  /** Ed25519 private key (32-byte hex). If set, every node written through this run is signed. */
  signingKey?: string;
}

export interface WriteNodeOptions {
  action_type: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  timestamp?: number;
  duration_ms?: number;
  parent_id?: string;
  /** Override previous_hashes (e.g. for merge nodes). Defaults to [lastHash] or [] for genesis. */
  previous_hashes?: string[];
}

function randomNodeId(): string {
  // 16 random hex chars is plenty for client-side uniqueness within a session.
  const bytes = new Uint8Array(8);
  (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `node_${hex}`;
}

// ── Run (wraps a session) ──────────────────────────────────────────────────

export class Run {
  private lastHash: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly session: Session,
    private readonly signingKey?: string,
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
    const body: Record<string, unknown> = {
      session_id: this.session.id,
      action_type: opts.action_type,
      input: opts.input,
      output: opts.output,
      error: opts.error,
      metadata: opts.metadata,
      custom_fields: opts.custom_fields,
      timestamp: opts.timestamp,
      duration_ms: opts.duration_ms,
      parent_id: opts.parent_id,
      previous_hashes: opts.previous_hashes,
    };

    if (this.signingKey) {
      const id = randomNodeId();
      const timestamp = opts.timestamp ?? Date.now();
      const previousHashes =
        opts.previous_hashes ?? (this.lastHash == null ? [] : [this.lastHash]);

      const payload: NodeHashPayload = {
        id,
        session_id: this.session.id,
        agent_id: this.session.agent_id,
        parent_id: opts.parent_id ?? null,
        action_type: opts.action_type,
        input: opts.input ?? null,
        output: opts.output ?? null,
        error: opts.error ?? null,
        metadata: opts.metadata ?? {},
        custom_fields: opts.custom_fields ?? {},
        timestamp,
        duration_ms: opts.duration_ms ?? null,
        previous_hashes: previousHashes,
      };
      const hash = hashNodePayload(payload);
      const signature = signEd25519(hash, this.signingKey);

      body.id = id;
      body.timestamp = timestamp;
      body.previous_hashes = previousHashes;
      body.signature = signature;
    }

    const res = await this.http.post<{ data: Node[] }>('/v1/nodes', body);
    const node = res.data[0];
    this.lastHash = node.hash;
    return node;
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
  constructor(
    private readonly http: HttpClient,
    private readonly defaultSigningKey?: string,
  ) {}

  async start(opts: StartRunOptions = {}): Promise<Run> {
    const res = await this.http.post<{ session: Session }>('/v1/sessions', {
      name: opts.name,
      metadata: opts.metadata,
    });
    return new Run(this.http, res.session, opts.signingKey ?? this.defaultSigningKey);
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
    return new Run(this.http, res.session, this.defaultSigningKey);
  }
}
