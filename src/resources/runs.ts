import { AsyncLocalStorage } from 'node:async_hooks';
import type { HttpClient } from '../client.js';
import type { Features } from '../config.js';
import {
  hashNodePayload,
  hashRunCreatePayload,
  signEd25519,
  type NodeHashPayload,
  type RunCreateHashPayload,
} from '../crypto.js';
import { buildHandoffToken, HandoffToken } from '../handoff-token.js';
import { SignalsResource, type EmitSignalInput, type Signal } from './signals.js';
import { pagePath, type PageOptions } from './query.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  agent_id: string;
  name: string;
  status: 'open' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  parent_run_id?: string | null;
  fork_point_node_id?: string | null;
  replay_seed?: string | null;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cache_read?: number;
  total_cache_write?: number;
  total_cost_usd?: number;
  llm_call_count?: number;
  tool_call_count?: number;
  error_count?: number;
  total_latency_ms?: number;
}

export interface Node {
  id: string;
  run_id: string;
  agent_id: string;
  parent_id: string | null;
  action_type: string;
  type: string | null;
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
  handoff_from?: string | null;
  handoff_to?: string | null;
  handoff_reason?: string | null;
}

export type RunProofReason = 'linkage' | 'hash' | 'signature' | 'missing_key';

export interface RunProof {
  run_id: string;
  valid: boolean;
  node_count: number;
  head_hash: string | null;
  first_invalid_node_id: string | null;
  reason: RunProofReason | null;
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
  /**
   * Buffer node writes and flush in batches (max 100 per POST) on
   * flush/close. Defaults to true. Set false for per-node POSTs.
   */
  buffered?: boolean;
  /** Deterministic seed persisted on the run. Requires features.replay=true. */
  replaySeed?: string;
  /** Encoded handoff attestation token from the sending agent's `run.handoff()`.
   *  Server verifies Ed25519 signature + binds this run to the signed handoff node. */
  parentHandoffToken?: string;
}

export interface StepOptions {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  /** Declared custom node type (see defineNodeType). */
  type?: string;
  /** Multi-agent handoff metadata — populated when a node represents a delegation. */
  handoffFrom?: string;
  handoffTo?: string;
  handoffReason?: string;
}

export interface LogOptions {
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  /** Declared custom node type (see defineNodeType). */
  type?: string;
}

export interface ContextOptions {
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  type?: string;
  /** Memory-read access events recorded during the run. */
  memory_reads?: import('./memory.js').MemoryAccess[];
  /** Memory-write access events recorded during the run. */
  memory_writes?: import('./memory.js').MemoryAccess[];
  /** Authoritative system records (CRM/ticket/policy snapshots) the run relied on. */
  authoritative_records?: import('./memory.js').SystemRecord[];
}

export interface ToolOptions {
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
}

export interface HandoffOptions {
  toAgentId: string;
  fromAgentId?: string;
  message?: unknown;
  reason?: string;
}

export interface ForkRunOptions {
  fromNodeId: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface WriteNodeOptions {
  action_type: string;
  /** Declared custom node type (see defineNodeType). */
  type?: string;
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

const BATCH_MAX = 100;

function randomNodeId(): string {
  const bytes = new Uint8Array(8);
  (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `node_${hex}`;
}

/** Per-async-context: the currently-active Step, used to auto-fill parent_id. */
const currentStep = new AsyncLocalStorage<Step>();

// ── Step ───────────────────────────────────────────────────────────────────

/**
 * One unit of work inside a Run. Mutate ``output``/``error``/``metadata``
 * during the step's body; on close the step emits a node carrying those
 * values plus ``parent_id`` (inherited from any enclosing step) and
 * elapsed ``duration_ms``.
 */
export class Step {
  readonly id = randomNodeId();
  input: unknown;
  output: unknown;
  error: unknown;
  metadata: Record<string, unknown> | undefined;
  custom_fields: Record<string, unknown> | undefined;
  type: string | undefined;
  handoffFrom: string | undefined;
  handoffTo: string | undefined;
  handoffReason: string | undefined;
  private readonly startMs = Date.now();
  private closed = false;

  constructor(
    private readonly run: RunHandle,
    readonly action_type: string,
    opts: StepOptions,
    readonly parent_id: string | null,
  ) {
    this.input = opts.input;
    this.output = opts.output;
    this.metadata = opts.metadata;
    this.custom_fields = opts.custom_fields;
    this.type = opts.type;
    this.handoffFrom = opts.handoffFrom;
    this.handoffTo = opts.handoffTo;
    this.handoffReason = opts.handoffReason;
  }

  /** Emit the node. Safe to call once. */
  async close(error?: unknown): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (error !== undefined && this.error === undefined) this.error = error;
    await this.run._emit({
      id: this.id,
      action_type: this.action_type,
      type: this.type,
      input: this.input,
      output: this.output,
      error: this.error,
      metadata: this.metadata,
      custom_fields: this.custom_fields,
      parent_id: this.parent_id,
      timestamp: this.startMs,
      duration_ms: Date.now() - this.startMs,
      handoff_from: this.handoffFrom,
      handoff_to: this.handoffTo,
      handoff_reason: this.handoffReason,
    });
  }
}

interface EmitArgs {
  id: string;
  action_type: string;
  type: string | undefined;
  input: unknown;
  output: unknown;
  error: unknown;
  metadata: Record<string, unknown> | undefined;
  custom_fields: Record<string, unknown> | undefined;
  parent_id: string | null;
  timestamp: number;
  duration_ms: number;
  handoff_from?: string;
  handoff_to?: string;
  handoff_reason?: string;
}

/** Minimal interface Step needs from a Run — lets us share Step with future AsyncLocalStorage variants. */
interface RunHandle {
  _emit(args: EmitArgs): Promise<void>;
}

// ── Run ────────────────────────────────────────────────────────────────────

/**
 * A developer-facing agent run.
 *
 * Prefer the callback form for guaranteed cleanup:
 *
 *   await inv.runs.start({ name: "x" }, async (run) => {
 *     await run.step("plan", {}, async (s) => { s.output = ...; });
 *   });
 *
 * On callback completion the run is marked ``completed``; on throw it is
 * marked ``failed``. Node writes are buffered (max 100 per POST) and
 * flushed on close or when the buffer fills.
 */
export class RunClient implements RunHandle {
  private lastHash: string | null = null;
  private lastNodeId: string | null = null;
  private buffer: WriteBody[] = [];
  private closed = false;
  /** Promise chain that serializes writes. The backend cannot detect branched
   * chains, so two concurrent `_emit`s within one run must not run both. */
  private writeChain: Promise<unknown> = Promise.resolve();
  private readonly signals: SignalsResource;

  constructor(
    private readonly http: HttpClient,
    private readonly run: Run,
    private readonly signingKey: string | undefined,
    private readonly buffered: boolean,
    private readonly tracing: boolean = true,
  ) {
    this.signals = new SignalsResource(http);
  }

  get runId(): string {
    return this.run.id;
  }

  get name(): string {
    return this.run.name;
  }

  get status(): string {
    return this.run.status;
  }

  // ── step ─────────────────────────────────────────────────────────

  /**
   * Run ``fn`` within a Step that is auto-emitted on completion.
   * Nested calls inherit ``parent_id`` via AsyncLocalStorage.
   */
  async step<T>(
    action_type: string,
    opts: StepOptions,
    fn: (step: Step) => Promise<T>,
  ): Promise<T> {
    const parent = currentStep.getStore();
    const step = new Step(this, action_type, opts, parent?.id ?? null);
    try {
      return await currentStep.run(step, () => fn(step));
    } catch (err) {
      await step.close(this.serializeError(err));
      throw err;
    } finally {
      if (!(step as unknown as { closed?: boolean }).closed) {
        await step.close();
      }
    }
  }

  // ── Ergonomic helpers ────────────────────────────────────────────

  /**
   * Append-only breadcrumb for human-legible events (prompts, decisions,
   * checkpoints). Emits a node with ``action_type: "log"``; ``data`` is stored
   * as structured input alongside ``message``.
   */
  async log(message: string, data?: unknown, opts: LogOptions = {}): Promise<void> {
    const input: Record<string, unknown> = { message };
    if (data !== undefined) input.data = data;
    await this.step(
      'log',
      {
        type: opts.type,
        input,
        metadata: opts.metadata,
        custom_fields: opts.custom_fields,
      },
      async () => {},
    );
  }

  /**
   * Attach structured state to the run (e.g. user id, workspace, risk tier).
   * Stored as the node's ``input`` so it stays searchable without overloading
   * ``metadata``.
   */
  async context(
    data: Record<string, unknown>,
    opts: ContextOptions = {},
  ): Promise<void> {
    await this.step(
      'context',
      {
        type: opts.type,
        input: data,
        metadata: opts.metadata,
        custom_fields: opts.custom_fields,
      },
      async () => {},
    );
  }

  /**
   * Record a tool invocation. In callback form, captures output, duration, and
   * thrown errors automatically. In direct form, accepts explicit output for
   * already-computed work. Emits with ``action_type: "tool_call"`` and
   * ``type: "tool_call"`` so dashboards treat it as the built-in typed node.
   */
  async tool<T>(name: string, input: unknown, fn: () => Promise<T>): Promise<T>;
  async tool(name: string, input: unknown, opts: ToolOptions): Promise<void>;
  async tool<T>(
    name: string,
    input: unknown,
    arg: (() => Promise<T>) | ToolOptions,
  ): Promise<T | void> {
    if (typeof arg === 'function') {
      return this.step(
        'tool_call',
        {
          type: 'tool_call',
          input,
          custom_fields: { tool_name: name, status: 'success', tool_input: input },
        },
        async (s) => {
          try {
            const out = await arg();
            s.output = out;
            s.custom_fields = {
              ...(s.custom_fields ?? {}),
              tool_output: out,
            };
            return out;
          } catch (err) {
            s.custom_fields = {
              ...(s.custom_fields ?? {}),
              status: 'error',
            };
            throw err;
          }
        },
      );
    }
    const opts = arg;
    const status = opts.error !== undefined ? 'error' : 'success';
    const custom_fields: Record<string, unknown> = {
      tool_name: name,
      status,
      tool_input: input,
      ...(opts.custom_fields ?? {}),
    };
    if (opts.output !== undefined) custom_fields.tool_output = opts.output;
    await this.step(
      'tool_call',
      {
        type: 'tool_call',
        input,
        output: opts.output,
        metadata: opts.metadata,
        custom_fields,
      },
      async (s) => {
        if (opts.error !== undefined) s.error = opts.error;
      },
    );
  }

  private serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
      return { type: err.name, message: err.message, stack: err.stack };
    }
    return { type: 'Unknown', message: String(err) };
  }

  // ── Low-level node emit (used by Step) ───────────────────────────

  async _emit(args: EmitArgs): Promise<void> {
    if (!this.tracing) return;
    const run = this.writeChain.then(() => this.doEmit(args));
    this.writeChain = run.catch(() => undefined);
    await run;
  }

  private async doEmit(args: EmitArgs): Promise<void> {
    const body = this.buildBody(args);
    this.buffer.push(body);
    this.lastNodeId = args.id;
    if (!this.buffered || this.buffer.length >= BATCH_MAX) {
      await this.flushLocked();
    }
  }

  private buildBody(args: EmitArgs): WriteBody {
    const body: WriteBody = {
      run_id: this.run.id,
      id: args.id,
      action_type: args.action_type,
    };
    if (args.type !== undefined) body.type = args.type;
    if (args.input !== undefined) body.input = args.input;
    if (args.output !== undefined) body.output = args.output;
    if (args.error !== undefined) body.error = args.error;
    if (args.metadata !== undefined) body.metadata = args.metadata;
    if (args.custom_fields !== undefined) body.custom_fields = args.custom_fields;
    if (args.parent_id !== null) body.parent_id = args.parent_id;
    if (args.handoff_from !== undefined) body.handoff_from = args.handoff_from;
    if (args.handoff_to !== undefined) body.handoff_to = args.handoff_to;
    if (args.handoff_reason !== undefined) body.handoff_reason = args.handoff_reason;
    body.duration_ms = args.duration_ms;

    if (this.signingKey) {
      const prev = this.lastHash == null ? [] : [this.lastHash];
      const { signature, hash } = this.signNode({
        id: args.id,
        parent_id: args.parent_id,
        action_type: args.action_type,
        input: args.input,
        output: args.output,
        error: args.error,
        metadata: args.metadata,
        custom_fields: args.custom_fields,
        timestamp: args.timestamp,
        duration_ms: args.duration_ms,
        previous_hashes: prev,
        handoff_from: args.handoff_from,
        handoff_to: args.handoff_to,
        handoff_reason: args.handoff_reason,
      });
      body.timestamp = args.timestamp;
      body.previous_hashes = prev;
      body.signature = signature;
      this.lastHash = hash;
    } else {
      body.timestamp = args.timestamp;
    }
    return body;
  }

  private signNode(args: {
    id: string;
    parent_id: string | null;
    action_type: string;
    input: unknown;
    output: unknown;
    error: unknown;
    metadata: Record<string, unknown> | undefined;
    custom_fields: Record<string, unknown> | undefined;
    timestamp: number;
    duration_ms: number | null;
    previous_hashes: string[];
    handoff_from: string | undefined;
    handoff_to: string | undefined;
    handoff_reason: string | undefined;
  }): { signature: string; hash: string } {
    const payload: NodeHashPayload = {
      id: args.id,
      run_id: this.run.id,
      agent_id: this.run.agent_id,
      parent_id: args.parent_id,
      action_type: args.action_type,
      input: args.input ?? null,
      output: args.output ?? null,
      error: args.error ?? null,
      metadata: args.metadata ?? {},
      custom_fields: args.custom_fields ?? {},
      timestamp: args.timestamp,
      duration_ms: args.duration_ms,
      previous_hashes: args.previous_hashes,
      handoff_from: args.handoff_from,
      handoff_to: args.handoff_to,
      handoff_reason: args.handoff_reason,
    };
    const hash = hashNodePayload(payload);
    return { signature: signEd25519(hash, this.signingKey!), hash };
  }

  async flush(): Promise<void> {
    await this.writeChain.catch(() => undefined);
    await this.flushLocked();
  }

  private async flushLocked(): Promise<void> {
    while (this.buffer.length) {
      const chunk = this.buffer.slice(0, BATCH_MAX);
      try {
        const res = await this.http.post<{ data: Node[] }>('/v1/nodes', chunk);
        this.buffer.splice(0, chunk.length);
        const nodes = res.data;
        if (nodes.length && !this.signingKey) {
          this.lastHash = nodes[nodes.length - 1].hash;
        }
      } catch (err) {
        // Leave the chunk at the head of the buffer so callers can retry / observe loss.
        throw err;
      }
    }
  }

  // ── Low-level escape hatch ──────────────────────────────────────

  async node(opts: WriteNodeOptions): Promise<Node> {
    // Flush buffer first so ordering is preserved.
    await this.flush();
    const timestamp = opts.timestamp ?? Date.now();
    const previous_hashes = opts.previous_hashes ?? (this.lastHash == null ? [] : [this.lastHash]);
    const body: Record<string, unknown> = {
      run_id: this.run.id,
      action_type: opts.action_type,
      type: opts.type,
      input: opts.input,
      output: opts.output,
      error: opts.error,
      metadata: opts.metadata,
      custom_fields: opts.custom_fields,
      duration_ms: opts.duration_ms,
      parent_id: opts.parent_id,
      timestamp,
      previous_hashes,
    };

    if (this.signingKey) {
      const id = randomNodeId();
      const { signature } = this.signNode({
        id,
        parent_id: opts.parent_id ?? null,
        action_type: opts.action_type,
        input: opts.input,
        output: opts.output,
        error: opts.error,
        metadata: opts.metadata,
        custom_fields: opts.custom_fields,
        timestamp,
        duration_ms: opts.duration_ms ?? null,
        previous_hashes,
        handoff_from: undefined,
        handoff_to: undefined,
        handoff_reason: undefined,
      });
      body.id = id;
      body.signature = signature;
    }

    const res = await this.http.post<{ data: Node[] }>('/v1/nodes', body);
    const node = res.data[0];
    this.lastHash = node.hash;
    this.lastNodeId = node.id;
    return node;
  }

  // ── Signals ─────────────────────────────────────────────────────

  /**
   * Emit a signal attached to the most recently written node in this run
   * (or to an explicit `node_id`). Accepts a raw `EmitSignalInput` or the
   * result of `SignalType.signal(...)`.
   */
  /**
   * Emit a typed `handoff` node marking delegation to another agent. Dashboards
   * render these as boundaries between swimlane rows.
   */
  async handoff(opts: HandoffOptions): Promise<HandoffToken | null> {
    const issuerAgentId = opts.fromAgentId ?? this.run.agent_id;
    await this.step(
      'handoff',
      {
        type: 'handoff',
        input: opts.message !== undefined ? { message: opts.message } : undefined,
        handoffFrom: issuerAgentId,
        handoffTo: opts.toAgentId,
        handoffReason: opts.reason,
      },
      async () => {},
    );
    if (!this.signingKey || this.lastHash == null || this.lastNodeId == null) {
      return null;
    }
    // Server lookup of handoff_node_id happens on receiver's runs.create, so we
    // must have flushed the handoff node first.
    await this.flush();
    return buildHandoffToken({
      iss_agent_id: issuerAgentId,
      iss_run_id: this.run.id,
      handoff_node_id: this.lastNodeId,
      handoff_node_hash: this.lastHash,
      to_agent_id: opts.toAgentId,
      signing_key: this.signingKey,
      iat_ms: Date.now(),
    });
  }

  async signal(input: EmitSignalInput): Promise<Signal> {
    await this.flush();
    const body: EmitSignalInput = {
      ...input,
      run_id: input.run_id ?? this.run.id,
    };
    const nodeId = input.node_id ?? this.lastNodeId;
    if (nodeId) body.node_id = nodeId;
    return this.signals.emit(body);
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async verify(): Promise<RunProof> {
    return this.http.get<RunProof>(`/v1/runs/${this.run.id}/verify`);
  }

  async finish(): Promise<Run> {
    await this.flush();
    if (this.closed) return this.run;
    this.closed = true;
    const res = await this.http.patch<{ run: Run }>(
      `/v1/runs/${this.run.id}`,
      { status: 'completed' },
    );
    return res.run;
  }

  async fail(error?: string): Promise<Run> {
    await this.flush().catch(() => undefined);
    if (this.closed) return this.run;
    this.closed = true;
    const res = await this.http.patch<{ run: Run }>(
      `/v1/runs/${this.run.id}`,
      { status: 'failed', metadata: error ? { error } : undefined },
    );
    return res.run;
  }
}

type WriteBody = Record<string, unknown>;

// ── Runs resource ──────────────────────────────────────────────────────────

export class RunsResource {
  private readonly features: Features;
  /** Cached agent_id, fetched lazily on the first signed run-create. */
  private cachedAgentId: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly defaultSigningKey?: string,
    features?: Features,
  ) {
    this.features = features ?? { replay: false, costTracking: true, tracing: true };
  }

  /** Fetch and cache the calling agent's id. Used to bind run-create signatures. */
  private async getAgentId(): Promise<string> {
    if (this.cachedAgentId !== null) return this.cachedAgentId;
    const me = await this.http.get<{ agent: { id: string } }>('/v1/agents/me');
    this.cachedAgentId = me.agent.id;
    return this.cachedAgentId;
  }

  /** Overload: callback form auto-finishes the run on completion (failing on throw). */
  async start<T>(
    opts: StartRunOptions,
    fn: (run: RunClient) => Promise<T>,
  ): Promise<T>;
  /** Overload: bare form returns a RunClient the caller must finish/fail. */
  async start(opts?: StartRunOptions): Promise<RunClient>;
  async start<T>(
    opts: StartRunOptions = {},
    fn?: (run: RunClient) => Promise<T>,
  ): Promise<T | RunClient> {
    if (opts.replaySeed !== undefined && !this.features.replay) {
      throw new Error(
        'replaySeed requires features.replay=true (set INVARIANCE_FEATURE_REPLAY=true)',
      );
    }
    const body: Record<string, unknown> = {
      name: opts.name,
      metadata: opts.metadata,
    };
    if (opts.replaySeed !== undefined) body.replay_seed = opts.replaySeed;
    if (opts.parentHandoffToken !== undefined) body.parent_handoff_token = opts.parentHandoffToken;

    // Run-level provenance: when a signing key is configured, sign the request
    // body so the backend can prove the run was created by the private-key
    // holder, not just the API-key bearer. Mirrors node signing — the same key
    // signs both, producing one verifiable chain from run-create through every
    // node in the run.
    const signingKey = opts.signingKey ?? this.defaultSigningKey;
    if (signingKey) {
      const timestamp = Date.now();
      const payload: RunCreateHashPayload = {
        agent_id: await this.getAgentId(),
        name: opts.name ?? '',
        metadata: opts.metadata ?? {},
        replay_seed: opts.replaySeed ?? null,
        parent_handoff_token: opts.parentHandoffToken ?? null,
        timestamp,
      };
      const hash = hashRunCreatePayload(payload);
      body.timestamp = timestamp;
      body.signature = signEd25519(hash, signingKey);
    }

    const res = await this.http.post<{ run: Run }>('/v1/runs', body);
    const client = new RunClient(
      this.http,
      res.run,
      signingKey,
      opts.buffered ?? true,
      this.features.tracing,
    );
    if (!fn) return client;
    try {
      const result = await fn(client);
      await client.finish();
      return result;
    } catch (err) {
      try {
        await client.fail(err instanceof Error ? err.message : String(err));
      } catch (failErr) {
        // Preserve the original error as the cause; surface fail() failure as a warning.
        if (err instanceof Error && failErr instanceof Error && !err.cause) {
          (err as { cause?: unknown }).cause = failErr;
        }
      }
      throw err;
    }
  }

  /** Fork a run from a given node. Requires features.replay=true. */
  async fork(runId: string, opts: ForkRunOptions): Promise<RunClient> {
    if (!this.features.replay) {
      throw new Error(
        'fork() requires features.replay=true (set INVARIANCE_FEATURE_REPLAY=true)',
      );
    }
    const res = await this.http.post<{ run: Run }>(`/v1/runs/${runId}/fork`, {
      from_node_id: opts.fromNodeId,
      name: opts.name,
      metadata: opts.metadata,
    });
    return new RunClient(this.http, res.run, this.defaultSigningKey, true, this.features.tracing);
  }

  async list(opts: PageOptions = {}): Promise<ListResponse<Run>> {
    return this.http.get<ListResponse<Run>>(pagePath('/v1/runs', opts));
  }

  async get(id: string): Promise<RunClient> {
    const res = await this.http.get<{ run: Run }>(`/v1/runs/${id}`);
    return new RunClient(this.http, res.run, this.defaultSigningKey, true, this.features.tracing);
  }

  /**
   * Fetch the operational graph for a run — entities, edges, findings, and a
   * completeness score derived from the captured trace. See MVP spec §4.
   */
  async operationalGraph(runId: string): Promise<OperationalGraphResponse> {
    return this.http.get<OperationalGraphResponse>(`/v1/runs/${runId}/operational-graph`);
  }
}

// ── Operational graph types ────────────────────────────────────────────────

export interface OperationalEntity {
  id: string;
  run_id?: string | null;
  kind: string;
  source: string;
  external_id?: string | null;
  title: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface OperationalEdgeProvenance {
  method: string;
  source_artifacts: string[];
  matching_features?: string[];
  alternatives?: string[];
  risk_impact?: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface OperationalEdge {
  id: string;
  run_id: string;
  source_id: string;
  target_id: string;
  kind: string;
  confidence: number;
  evidence_node_ids: string[];
  provenance: OperationalEdgeProvenance;
  recipe_id?: string | null;
  created_at: string;
}

export interface OperationalFindingEvidence {
  label: string;
  ref: string;
  type: 'trace' | 'system' | 'doc' | 'history' | 'human';
}

export interface OperationalFinding {
  id: string;
  run_id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  affected_entity_ids: string[];
  evidence_node_ids: string[];
  evidence: OperationalFindingEvidence[];
  missing_control?: string | null;
  recommended_guardrail?: {
    title: string;
    rule: string;
    mode: 'suggested' | 'shadow' | 'active_monitor';
  } | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'rejected';
  created_at: string;
}

export interface OperationalGraphCompleteness {
  business_object_linked: boolean;
  policy_context_found: boolean;
  owner_found: boolean;
  approval_context_found: boolean;
  downstream_state_change_found: boolean;
  score: number;
}

export interface OperationalGraphResponse {
  run_id: string;
  entities: OperationalEntity[];
  edges: OperationalEdge[];
  findings: OperationalFinding[];
  completeness: OperationalGraphCompleteness;
}
