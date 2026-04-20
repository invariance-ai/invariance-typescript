import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Signal } from './signals.js';
import type { Finding } from './findings.js';
import type { Review } from './reviews.js';
import { pagePath, type PageOptions } from './query.js';

// ── Public spec (what the user writes) ─────────────────────────────────────

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type On =
  | { session: { id?: string; tags?: string[] } }
  | { run: { id?: string; agent_id?: string } }
  | { agent: { id: string } }
  | { node: { type?: string; action_type?: string; agent_id?: string } }
  | { batch: { window_minutes: number } };

export type NumericOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type Rule =
  | { kind: 'field_equals'; field: string; value: unknown }
  | { kind: 'field_contains'; field: string; value: unknown }
  | { kind: 'numeric'; field: string; op: NumericOp; value: number };

export type Action =
  | { kind: 'create_finding'; severity: Severity; title: string; message?: string; type?: string }
  | { kind: 'emit_signal'; severity: Severity; title: string; message?: string; type?: string };

export interface MonitorSpec {
  name: string;
  on: On;
  when: Rule;
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
  numeric: (field: string, op: NumericOp, value: number): Rule => ({ kind: 'numeric', field, op, value }),
};

export const action = {
  createFinding: (opts: { severity: Severity; title: string; message?: string; type?: string }): Action => ({ kind: 'create_finding', ...opts }),
  emitSignal: (opts: { severity: Severity; title: string; message?: string; type?: string }): Action => ({ kind: 'emit_signal', ...opts }),
};

// ── Compilation: MonitorSpec → backend CreateMonitorRequest ────────────────

const OP_MAP: Record<NumericOp, '>' | '>=' | '<' | '<=' | '==' | '!='> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '==',
  neq: '!=',
};

function compileRuleToEvaluator(r: Rule): MonitorEvaluator {
  switch (r.kind) {
    case 'field_contains':
      return { type: 'keyword', field: r.field, keywords: [String(r.value)], case_sensitive: false };
    case 'field_equals':
      return { type: 'keyword', field: r.field, keywords: [String(r.value)], case_sensitive: true };
    case 'numeric':
      return { type: 'threshold', field: r.field, operator: OP_MAP[r.op], value: r.value };
  }
}

export function compileMonitor(spec: MonitorSpec): CreateMonitorRequest {
  const evaluatorBody = compileRuleToEvaluator(spec.when);

  const actions = Array.isArray(spec.do) ? spec.do : [spec.do];
  const signalAction = actions.find((a) => a.kind === 'emit_signal' || a.kind === 'create_finding');
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

export type MonitorListOptions = PageOptions;

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
    return this.http.get<ListResponse<Monitor>>(pagePath('/v1/monitors', opts));
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
    opts: PageOptions = {},
  ): Promise<ListResponse<MonitorExecution>> {
    return this.http.get<ListResponse<MonitorExecution>>(
      pagePath(`/v1/monitors/${id}/executions`, opts),
    );
  }

  async findings(
    id: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<Finding>> {
    return this.http.get<ListResponse<Finding>>(
      pagePath(`/v1/monitors/${id}/findings`, opts),
    );
  }
}
