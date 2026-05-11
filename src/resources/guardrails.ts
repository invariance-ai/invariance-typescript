import type { HttpClient } from '../client.js';
import type { ListResponse } from './runs.js';
import type { GuardrailMode } from './recipes.js';
import { withQuery, type PageOptions } from './query.js';

export type GuardrailStatus =
  | 'suggested'
  | 'accepted'
  | 'shadow'
  | 'active_monitor'
  | 'rejected';

export interface Guardrail {
  id: string;
  agent_id: string;
  recipe_id: string | null;
  finding_id: string | null;
  title: string;
  rule: string;
  mode: GuardrailMode;
  status: GuardrailStatus;
  monitor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateGuardrailInput {
  title: string;
  recipe_id?: string | null;
  finding_id?: string | null;
  rule?: string;
  mode?: GuardrailMode;
  status?: GuardrailStatus;
  agent_id?: string;
}

export interface UpdateGuardrailPatch {
  mode?: GuardrailMode;
  status?: GuardrailStatus;
  monitor_id?: string | null;
}

export interface GuardrailListOptions extends PageOptions {
  status?: GuardrailStatus;
  recipe_id?: string;
}

/**
 * Per-agent guardrail lifecycle: suggested → accepted → shadow →
 * active_monitor → rejected. Guardrails are created from recipes or
 * findings; `promote()` is the canonical lifecycle transition.
 */
export class GuardrailsResource {
  constructor(private readonly http: HttpClient) {}

  list(opts: GuardrailListOptions = {}): Promise<ListResponse<Guardrail>> {
    return this.http.get<ListResponse<Guardrail>>(
      withQuery('/v1/guardrails', {
        cursor: opts.cursor,
        limit: opts.limit,
        status: opts.status,
        recipe_id: opts.recipe_id,
      }),
    );
  }

  async get(id: string): Promise<Guardrail> {
    const res = await this.http.get<{ guardrail: Guardrail }>(`/v1/guardrails/${id}`);
    return res.guardrail;
  }

  async create(input: CreateGuardrailInput): Promise<Guardrail> {
    const res = await this.http.post<{ guardrail: Guardrail }>('/v1/guardrails', input);
    return res.guardrail;
  }

  async update(id: string, patch: UpdateGuardrailPatch): Promise<Guardrail> {
    const res = await this.http.request<{ guardrail: Guardrail }>(
      'PATCH',
      `/v1/guardrails/${id}`,
      patch,
    );
    return res.guardrail;
  }

  async promote(id: string, to: GuardrailStatus): Promise<Guardrail> {
    const res = await this.http.post<{ guardrail: Guardrail }>(
      `/v1/guardrails/${id}/promote`,
      { to },
    );
    return res.guardrail;
  }
}
