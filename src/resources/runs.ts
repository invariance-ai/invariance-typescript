import { AsyncLocalStorage } from 'node:async_hooks';
import type { HttpClient } from '../client.js';
import { hashNodePayload, signEd25519, type NodeHashPayload } from '../crypto.js';
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
}

export interface StepOptions {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  /** Declared custom node type (see defineNodeType). */
  type?: string;
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
    });
  }
}

/** Minimal interface Step needs from a Run — lets us share Step with future AsyncLocalStorage variants. */
interface RunHandle {
  _emit(args: {
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
  }): Promise<void>;
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

  private serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
      return { type: err.name, message: err.message, stack: err.stack };
    }
    return { type: 'Unknown', message: String(err) };
  }

  // ── Low-level node emit (used by Step) ───────────────────────────

  async _emit(args: {
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
  }): Promise<void> {
    const run = this.writeChain.then(() => this.doEmit(args));
    this.writeChain = run.catch(() => undefined);
    await run;
  }

  private async doEmit(args: {
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
  }): Promise<void> {
    const body = this.buildBody(args);
    this.buffer.push(body);
    this.lastNodeId = args.id;
    if (!this.buffered || this.buffer.length >= BATCH_MAX) {
      await this.flushLocked();
    }
  }

  private buildBody(args: {
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
  }): WriteBody {
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
      const chunk = this.buffer.splice(0, BATCH_MAX);
      const res = await this.http.post<{ data: Node[] }>('/v1/nodes', chunk);
      const nodes = res.data;
      if (nodes.length && !this.signingKey) {
        this.lastHash = nodes[nodes.length - 1].hash;
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
  constructor(
    private readonly http: HttpClient,
    private readonly defaultSigningKey?: string,
  ) {}

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
    const res = await this.http.post<{ run: Run }>('/v1/runs', {
      name: opts.name,
      metadata: opts.metadata,
    });
    const client = new RunClient(
      this.http,
      res.run,
      opts.signingKey ?? this.defaultSigningKey,
      opts.buffered ?? true,
    );
    if (!fn) return client;
    try {
      const result = await fn(client);
      await client.finish();
      return result;
    } catch (err) {
      await client.fail(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async list(opts: PageOptions = {}): Promise<ListResponse<Run>> {
    return this.http.get<ListResponse<Run>>(pagePath('/v1/runs', opts));
  }

  async get(id: string): Promise<RunClient> {
    const res = await this.http.get<{ run: Run }>(`/v1/runs/${id}`);
    return new RunClient(this.http, res.run, this.defaultSigningKey, true);
  }
}
