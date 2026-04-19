import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Signal } from './signals.js';
import type { Finding } from './findings.js';
import type { Review } from './reviews.js';

// ── Public spec (what the user writes) ─────────────────────────────────────

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type On =
  | { session: { id?: string; tags?: string[] } }
  | { run: { id?: string; agent_id?: string } }
  | { agent: { id: string } }
  | { node: { type?: string; action_type?: string; agent_id?: string } }
  | { batch: { window_minutes: number } };

export type Rule =
  | { kind: 'field_equals'; field: string; value: unknown }
  | { kind: 'field_contains'; field: string; value: unknown }
  | { kind: 'numeric'; field: string; op: 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { kind: 'exists'; field: string; exists?: boolean }
  | { kind: 'frequency'; field: string; value: unknown; per_minutes: number; op: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number; window_minutes: number };

export type Evaluator =
  | { kind: 'judge_llm'; model: string; rubric: string; output_schema?: Record<string, unknown>; max_tokens?: number }
  | { kind: 'judge_human'; queue: string; instructions?: string; notify?: ('email' | 'slack' | 'dashboard')[] }
  | { kind: 'code'; runtime?: 'hosted' | 'customer'; inline_script: string };

export type When = Rule | Evaluator | { match: 'all' | 'any'; rules: Rule[] };

export type Action =
  | { kind: 'create_finding'; severity: Severity; title: string; message?: string; type?: string }
  | { kind: 'emit_signal'; severity: Severity; title: string; message?: string; type?: string }
  | { kind: 'notify'; channel: 'email' | 'slack' | 'webhook' | 'dashboard'; target: string }
  | { kind: 'mark'; label: string }
  | { kind: 'webhook'; url: string; method?: 'GET' | 'POST'; headers?: Record<string, string> };

export interface MonitorSpec {
  name: string;
  on: On;
  when: When;
  do: Action | Action[];
  severity?: Severity;
  description?: string;
}

// ── Backend-shaped types (mirrors @invariance/api-types) ───────────────────

export type MonitorEvaluator =
  | { type: 'keyword'; field: string; keywords: string[]; case_sensitive?: boolean }
  | { type: 'threshold'; field: string; operator: '>' | '>=' | '<' | '<=' | '==' | '!='; value: number };

export interface MonitorSchedule {
  kind: 'manual' | 'interval';
  every_seconds?: number;
}

export interface CreateMonitorRequest {
  name: string;
  description?: string;
  enabled?: boolean;
  evaluator: MonitorEvaluator;
  severity?: Severity;
  schedule?: MonitorSchedule;
  creates_review?: boolean;
  signal_type?: string | null;
}

export interface UpdateMonitorRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  evaluator?: MonitorEvaluator;
  schedule?: MonitorSchedule;
  creates_review?: boolean;
  signal_type?: string | null;
}

export interface EvaluateMonitorRequest {
  run_id?: string;
  since?: string;
  limit?: number;
}

export interface Monitor {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  evaluator: MonitorEvaluator;
  severity: Severity;
  schedule: MonitorSchedule;
  creates_review: boolean;
  signal_type: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonitorExecution {
  id: string;
  monitor_id: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  trigger: 'manual' | 'scheduled';
  matched_node_ids: string[];
  started_at: string;
  finished_at: string | null;
  error?: string | null;
}

export interface EvaluateMonitorResponse {
  execution: MonitorExecution;
  signals: Signal[];
  findings: Finding[];
  reviews: Review[];
}

// ── Builders (ergonomic factories) ─────────────────────────────────────────

export const on = {
  session: (match: { id?: string; tags?: string[] } = {}): On => ({ session: match }),
  run: (match: { id?: string; agent_id?: string } = {}): On => ({ run: match }),
  agent: (id: string): On => ({ agent: { id } }),
  node: (match: { type?: string; action_type?: string; agent_id?: string } = {}): On => ({ node: match }),
  batch: (window_minutes: number): On => ({ batch: { window_minutes } }),
};

export const rule = {
  fieldEquals: (field: string, value: unknown): Rule => ({ kind: 'field_equals', field, value }),
  fieldContains: (field: string, value: unknown): Rule => ({ kind: 'field_contains', field, value }),
  numeric: (field: string, op: 'gt' | 'gte' | 'lt' | 'lte', value: number): Rule => ({ kind: 'numeric', field, op, value }),
  exists: (field: string, exists = true): Rule => ({ kind: 'exists', field, exists }),
  frequency: (
    field: string,
    value: unknown,
    opts: { per_minutes: number; op: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number; window_minutes: number },
  ): Rule => ({ kind: 'frequency', field, value, ...opts }),
  all: (...rules: Rule[]): When => ({ match: 'all', rules }),
  any: (...rules: Rule[]): When => ({ match: 'any', rules }),
};

export const evaluator = {
  judgeLLM: (opts: { model: string; rubric: string; output_schema?: Record<string, unknown>; max_tokens?: number }): Evaluator => ({
    kind: 'judge_llm',
    ...opts,
  }),
  judgeHuman: (opts: { queue: string; instructions?: string; notify?: ('email' | 'slack' | 'dashboard')[] }): Evaluator => ({
    kind: 'judge_human',
    ...opts,
  }),
  code: (inline_script: string, opts: { runtime?: 'hosted' | 'customer' } = {}): Evaluator => ({
    kind: 'code',
    inline_script,
    ...opts,
  }),
};

export const action = {
  createFinding: (opts: { severity: Severity; title: string; message?: string; type?: string }): Action => ({ kind: 'create_finding', ...opts }),
  emitSignal: (opts: { severity: Severity; title: string; message?: string; type?: string }): Action => ({ kind: 'emit_signal', ...opts }),
  notify: (channel: 'email' | 'slack' | 'webhook' | 'dashboard', target: string): Action => ({ kind: 'notify', channel, target }),
  mark: (label: string): Action => ({ kind: 'mark', label }),
  webhook: (url: string, opts: { method?: 'GET' | 'POST'; headers?: Record<string, string> } = {}): Action => ({ kind: 'webhook', url, ...opts }),
};

// ── Compilation: MonitorSpec → backend CreateMonitorRequest ────────────────

const OP_MAP: Record<'gt' | 'gte' | 'lt' | 'lte', '>' | '>=' | '<' | '<='> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function compileRuleToEvaluator(r: Rule): MonitorEvaluator {
  switch (r.kind) {
    case 'field_contains':
      return { type: 'keyword', field: r.field, keywords: [String(r.value)], case_sensitive: false };
    case 'field_equals':
      return { type: 'keyword', field: r.field, keywords: [String(r.value)], case_sensitive: true };
    case 'numeric':
      return { type: 'threshold', field: r.field, operator: OP_MAP[r.op], value: r.value };
    case 'exists':
    case 'frequency':
      throw new Error(
        `rule.${r.kind} is not supported by the current backend evaluator`,
      );
  }
}

export function compileMonitor(spec: MonitorSpec): CreateMonitorRequest {
  if ('match' in spec.when) {
    throw new Error('rule.any/all composition is not supported by the current backend evaluator');
  }
  if (spec.when.kind === 'judge_llm' || spec.when.kind === 'judge_human' || spec.when.kind === 'code') {
    throw new Error(`evaluator.${spec.when.kind} is not supported by the current backend evaluator`);
  }

  const evaluatorBody = compileRuleToEvaluator(spec.when);

  const actions = Array.isArray(spec.do) ? spec.do : [spec.do];
  for (const a of actions) {
    if (a.kind === 'notify' || a.kind === 'mark' || a.kind === 'webhook') {
      throw new Error(`action.${a.kind} is not supported by the current backend`);
    }
  }

  const signalAction = actions.find((a) => a.kind === 'emit_signal' || a.kind === 'create_finding') as
    | (Action & { kind: 'emit_signal' | 'create_finding' })
    | undefined;
  const createsReview = actions.some((a) => a.kind === 'create_finding');

  const body: CreateMonitorRequest = {
    name: spec.name,
    evaluator: evaluatorBody,
    severity: signalAction?.severity ?? spec.severity ?? 'medium',
  };
  if (spec.description !== undefined) body.description = spec.description;
  if (signalAction?.type) body.signal_type = signalAction.type;
  if (createsReview) body.creates_review = true;
  return body;
}

// ── Resource ───────────────────────────────────────────────────────────────

export interface MonitorListOptions {
  cursor?: string;
  limit?: number;
}

export class MonitorsResource {
  constructor(private readonly http: HttpClient) {}

  async create(spec: MonitorSpec): Promise<Monitor> {
    const res = await this.http.post<{ monitor: Monitor }>('/v1/monitors', compileMonitor(spec));
    return res.monitor;
  }

  async get(id: string): Promise<Monitor> {
    const res = await this.http.get<{ monitor: Monitor }>(`/v1/monitors/${id}`);
    return res.monitor;
  }

  async list(opts: MonitorListOptions = {}): Promise<ListResponse<Monitor>> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.http.get<ListResponse<Monitor>>(`/v1/monitors${qs ? `?${qs}` : ''}`);
  }

  async update(id: string, patch: UpdateMonitorRequest): Promise<Monitor> {
    const res = await this.http.request<{ monitor: Monitor }>('PATCH', `/v1/monitors/${id}`, patch);
    return res.monitor;
  }

  pause(id: string): Promise<Monitor> {
    return this.update(id, { enabled: false });
  }

  resume(id: string): Promise<Monitor> {
    return this.update(id, { enabled: true });
  }

  async evaluate(id: string, input: EvaluateMonitorRequest = {}): Promise<EvaluateMonitorResponse> {
    return this.http.post<EvaluateMonitorResponse>(`/v1/monitors/${id}/evaluate`, input);
  }

  async executions(
    id: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<ListResponse<MonitorExecution>> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.http.get<ListResponse<MonitorExecution>>(
      `/v1/monitors/${id}/executions${qs ? `?${qs}` : ''}`,
    );
  }

  async findings(
    id: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<ListResponse<Finding>> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return this.http.get<ListResponse<Finding>>(
      `/v1/monitors/${id}/findings${qs ? `?${qs}` : ''}`,
    );
  }
}
