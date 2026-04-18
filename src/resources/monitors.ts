import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';

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

// ── Backend-shaped response (kept loose — we just pass it through) ─────────

export interface Monitor {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'disabled';
  definition: Record<string, unknown>;
  severity?: string;
  agent_id?: string | null;
  webhook_url?: string | null;
  triggers_count: number;
  last_triggered?: number | string | null;
  created_at: number | string;
  updated_at?: string;
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

// ── Compilation: MonitorSpec → backend MonitorDefinition JSON ──────────────

interface CompiledDefinition {
  version: 1;
  target: 'trace_node' | 'session' | 'signal';
  target_match: {
    mode: 'direct' | 'contains';
    scope: 'node' | 'session' | 'run' | 'agent' | 'batch';
    filters?: { field: string; operator: 'eq' | 'neq' | 'contains' | 'in' | 'exists'; value?: unknown }[];
    labels?: string[];
  };
  match: 'all' | 'any';
  rules: Record<string, unknown>[];
  evaluator?: Record<string, unknown>;
  actions?: Record<string, unknown>[];
  signal: { title: string; message: string; severity: Severity; type?: string };
  trigger: Record<string, unknown>;
}

function compileOn(o: On): Pick<CompiledDefinition, 'target' | 'target_match' | 'trigger'> {
  if ('session' in o) {
    const filters = [];
    if (o.session.id) filters.push({ field: 'session_id', operator: 'eq' as const, value: o.session.id });
    return {
      target: 'session',
      target_match: { mode: 'direct', scope: 'session', filters, labels: o.session.tags },
      trigger: { type: 'event', source: 'session' },
    };
  }
  if ('run' in o) {
    const filters = [];
    if (o.run.id) filters.push({ field: 'run_id', operator: 'eq' as const, value: o.run.id });
    if (o.run.agent_id) filters.push({ field: 'agent_id', operator: 'eq' as const, value: o.run.agent_id });
    return {
      target: 'trace_node',
      target_match: { mode: 'contains', scope: 'run', filters },
      trigger: { type: 'event', source: 'trace_node' },
    };
  }
  if ('agent' in o) {
    return {
      target: 'trace_node',
      target_match: {
        mode: 'contains',
        scope: 'agent',
        filters: [{ field: 'agent_id', operator: 'eq', value: o.agent.id }],
      },
      trigger: { type: 'event', source: 'trace_node' },
    };
  }
  if ('node' in o) {
    const filters = [];
    if (o.node.type) filters.push({ field: 'type', operator: 'eq' as const, value: o.node.type });
    if (o.node.action_type) filters.push({ field: 'action_type', operator: 'eq' as const, value: o.node.action_type });
    if (o.node.agent_id) filters.push({ field: 'agent_id', operator: 'eq' as const, value: o.node.agent_id });
    return {
      target: 'trace_node',
      target_match: { mode: 'direct', scope: 'node', filters },
      trigger: { type: 'event', source: 'trace_node' },
    };
  }
  return {
    target: 'signal',
    target_match: { mode: 'contains', scope: 'batch' },
    trigger: { type: 'schedule', cadence_minutes: o.batch.window_minutes },
  };
}

function compileRule(r: Rule): Record<string, unknown> {
  switch (r.kind) {
    case 'field_equals':
      return { kind: 'field_match', field: r.field, operator: 'eq', value: r.value };
    case 'field_contains':
      return { kind: 'field_match', field: r.field, operator: 'contains', value: r.value };
    case 'numeric':
      return { kind: 'numeric_threshold', field: r.field, operator: r.op, value: r.value };
    case 'exists':
      return { kind: 'exists', field: r.field, exists: r.exists ?? true };
    case 'frequency':
      return {
        kind: 'frequency',
        field: r.field,
        operator: 'eq',
        value: r.value,
        rate: { per_minutes: r.per_minutes, operator: r.op, value: r.threshold },
        window_minutes: r.window_minutes,
      };
  }
}

function compileEvaluator(e: Evaluator): Record<string, unknown> {
  switch (e.kind) {
    case 'judge_llm':
      return { type: 'judge_llm', model: e.model, rubric: e.rubric, output_schema: e.output_schema, max_tokens: e.max_tokens };
    case 'judge_human':
      return { type: 'judge_human', queue: e.queue, instructions: e.instructions, notify: e.notify };
    case 'code':
      return { type: 'code', runtime: e.runtime ?? 'hosted', entrypoint: 'main', inline_script: e.inline_script };
  }
}

function compileAction(a: Action, defaultSeverity: Severity): Record<string, unknown> {
  switch (a.kind) {
    case 'create_finding':
      return { type: 'create_finding', severity: a.severity, title: a.title, message: a.message ?? a.title, ...(a.type ? { signal_type: a.type } : {}) };
    case 'emit_signal':
      return { type: 'emit_signal', severity: a.severity, title: a.title, message: a.message ?? a.title, ...(a.type ? { signal_type: a.type } : {}) };
    case 'notify':
      return { type: 'notify', channel: a.channel, target: a.target };
    case 'mark':
      return { type: 'mark_object', label: a.label };
    case 'webhook':
      return { type: 'webhook', url: a.url, method: a.method ?? 'POST', headers: a.headers };
    default: {
      const _never: never = a;
      void _never;
      void defaultSeverity;
      throw new Error('unreachable');
    }
  }
}

function isEvaluator(w: When): w is Evaluator {
  return 'kind' in w && (w.kind === 'judge_llm' || w.kind === 'judge_human' || w.kind === 'code');
}
function isRule(w: When): w is Rule {
  return 'kind' in w && !isEvaluator(w);
}

export function compileMonitor(spec: MonitorSpec): CompiledDefinition {
  const { target, target_match, trigger } = compileOn(spec.on);
  const actions = (Array.isArray(spec.do) ? spec.do : [spec.do]).map((a) => compileAction(a, spec.severity ?? 'medium'));

  let match: 'all' | 'any' = 'all';
  let rules: Record<string, unknown>[] = [];
  let evaluatorDef: Record<string, unknown> | undefined;

  if (isEvaluator(spec.when)) {
    evaluatorDef = compileEvaluator(spec.when);
  } else if (isRule(spec.when)) {
    rules = [compileRule(spec.when)];
  } else {
    match = spec.when.match;
    rules = spec.when.rules.map(compileRule);
  }

  // Derive canonical signal from first finding/signal action, else spec name.
  const signalAction = actions.find((a) => a.type === 'create_finding' || a.type === 'emit_signal');
  const signal: CompiledDefinition['signal'] = signalAction
    ? {
        title: signalAction.title as string,
        message: signalAction.message as string,
        severity: (signalAction.severity as Severity) ?? spec.severity ?? 'medium',
        ...(signalAction.signal_type ? { type: signalAction.signal_type as string } : {}),
      }
    : { title: spec.name, message: spec.description ?? spec.name, severity: spec.severity ?? 'medium' };

  return {
    version: 1,
    target,
    target_match,
    match,
    rules,
    evaluator: evaluatorDef,
    actions,
    signal,
    trigger,
  };
}

// ── Resource ───────────────────────────────────────────────────────────────

export interface MonitorListOptions {
  cursor?: string;
  limit?: number;
  status?: 'active' | 'paused' | 'disabled';
}

export class MonitorsResource {
  constructor(private readonly http: HttpClient) {}

  async create(spec: MonitorSpec): Promise<Monitor> {
    const body = {
      name: spec.name,
      definition: compileMonitor(spec),
      severity: spec.severity,
    };
    const res = await this.http.post<{ monitor: Monitor }>('/v1/monitors', body);
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
    if (opts.status) params.set('status', opts.status);
    const qs = params.toString();
    return this.http.get<ListResponse<Monitor>>(`/v1/monitors${qs ? `?${qs}` : ''}`);
  }

  async update(id: string, patch: Partial<Pick<MonitorSpec, 'name' | 'severity'>> & { status?: 'active' | 'paused' }): Promise<Monitor> {
    const res = await this.http.request<{ monitor: Monitor }>('PUT', `/v1/monitors/${id}`, patch);
    return res.monitor;
  }

  pause(id: string): Promise<Monitor> {
    return this.update(id, { status: 'paused' });
  }

  resume(id: string): Promise<Monitor> {
    return this.update(id, { status: 'active' });
  }
}
