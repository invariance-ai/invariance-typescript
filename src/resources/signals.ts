import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { Severity } from './monitors.js';
import { pagePath, type PageOptions } from './query.js';

export interface Signal {
  id: string;
  agent_id: string;
  monitor_id: string | null;
  monitor_execution_id: string | null;
  run_id: string | null;
  node_id: string | null;
  source: 'monitor' | 'manual' | 'detector';
  severity: Severity;
  title: string;
  message: string | null;
  status: 'open' | 'acknowledged' | 'resolved';
  type: string | null;
  data: unknown;
  acknowledged_at: string | null;
  created_at: string;
}

export interface EmitSignalInput {
  /** Defaults to 'info' when omitted. */
  severity?: Severity;
  title: string;
  message?: string;
  type?: string;
  data?: unknown;
  node_id?: string;
  run_id?: string;
}

interface EmitSignalBody {
  severity: Severity;
  title: string;
  message?: string;
  type?: string;
  data?: unknown;
  node_id?: string;
  run_id?: string;
}

/** Strip undefined fields so the wire payload stays tidy. */
export function buildSignalBody(input: EmitSignalInput): EmitSignalBody {
  const body: EmitSignalBody = {
    severity: input.severity ?? 'info',
    title: input.title,
  };
  if (input.message !== undefined) body.message = input.message;
  if (input.type !== undefined) body.type = input.type;
  if (input.data !== undefined) body.data = input.data;
  if (input.node_id !== undefined) body.node_id = input.node_id;
  if (input.run_id !== undefined) body.run_id = input.run_id;
  return body;
}

export class SignalsResource {
  constructor(private readonly http: HttpClient) {}

  async emit(input: EmitSignalInput): Promise<Signal> {
    // Auto-context: an agent running inside a recorded run can set
    // INVARIANCE_RUN_ID / INVARIANCE_NODE_ID once and emit progress events
    // without plumbing IDs through every call site.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    const filled: EmitSignalInput = {
      ...input,
      run_id: input.run_id ?? env?.INVARIANCE_RUN_ID,
      node_id: input.node_id ?? env?.INVARIANCE_NODE_ID,
    };
    const res = await this.http.post<{ signal: Signal }>('/v1/signals', buildSignalBody(filled));
    return res.signal;
  }

  async list(opts: PageOptions = {}): Promise<ListResponse<Signal>> {
    return this.http.get<ListResponse<Signal>>(pagePath('/v1/signals', opts));
  }

  async get(id: string): Promise<Signal> {
    const res = await this.http.get<{ signal: Signal }>(`/v1/signals/${id}`);
    return res.signal;
  }

  async acknowledge(id: string): Promise<Signal> {
    const res = await this.http.patch<{ signal: Signal }>(`/v1/signals/${id}/acknowledge`);
    return res.signal;
  }

  async resolve(id: string): Promise<Signal> {
    const res = await this.http.patch<{ signal: Signal }>(`/v1/signals/${id}/resolve`);
    return res.signal;
  }
}
