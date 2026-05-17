import type { HttpClient } from '../client.js';
import { pagePath, type PageOptions } from './query.js';
import type { ListResponse, Run, RunClient } from './runs.js';
import {
  workflowEventBody,
  type CreateWorkflowEventOptions,
  type WorkflowEvent,
} from './workflow-events.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type CaseStatus = 'open' | 'closed';

/**
 * Workflow instance owning many runs across time, agents, and humans.
 * Use for vertical AI-native platforms (one loan, one audit, one claim).
 * Single-agent users can ignore cases entirely.
 */
export interface Case {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  end_user_id: string | null;
  workflow_key: string;
  status: CaseStatus;
  outcome: string | null;
  outcome_value_usd: number | null;
  owner: string | null;
  custom_attrs: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseWithRuns extends Case {
  runs: Run[];
}

export interface CreateCaseOptions {
  /** Stable workflow identifier (e.g. "mortgage.refi", "audit.sox.control"). */
  workflowKey: string;
  /** Optional client-supplied id. Must start with `case_`. */
  id?: string;
  /** The platform's own customer (e.g. an audit firm). */
  tenantId?: string | null;
  /** The end-user the workflow is acting on behalf of. */
  endUserId?: string | null;
  /** Assigned human or team. */
  owner?: string | null;
  /** Arbitrary structured attributes (loan_id, control_id, etc.). */
  customAttrs?: Record<string, unknown>;
  /** When the case was opened in the source system. ISO-8601. Defaults to now. */
  openedAt?: string;
}

export interface UpdateCaseOptions {
  status?: CaseStatus;
  outcome?: string | null;
  outcomeValueUsd?: number | null;
  owner?: string | null;
  /** Shallow-merged into existing custom_attrs server-side. */
  customAttrs?: Record<string, unknown> | null;
  closedAt?: string | null;
}

export interface CloseCaseOptions {
  outcome: string;
  /** Realized $ value (positive) or loss (negative). */
  valueUsd?: number;
  /** When close happened in source system. ISO-8601. Defaults to now. */
  closedAt?: string;
}

// ── Case context (auto-stamps case_id on runs started inside it) ───────────

interface CaseContextState {
  caseId: string;
  tenantId: string | null;
  endUserId: string | null;
}

import { AsyncLocalStorage } from 'node:async_hooks';

const currentCase = new AsyncLocalStorage<CaseContextState>();

/**
 * Internal: returns the active case context (if any). The Runs resource reads
 * this to auto-stamp case_id/tenant_id/end_user_id on `inv.runs.start(...)`
 * called inside `inv.cases.with(...)`.
 */
export function activeCaseContext(): CaseContextState | undefined {
  return currentCase.getStore();
}

// ── Resource ───────────────────────────────────────────────────────────────

export class CasesResource {
  constructor(private readonly http: HttpClient) {}

  /** Create a new case. */
  async create(opts: CreateCaseOptions): Promise<Case> {
    const body: Record<string, unknown> = {
      workflow_key: opts.workflowKey,
    };
    if (opts.id !== undefined) body.id = opts.id;
    if (opts.tenantId !== undefined) body.tenant_id = opts.tenantId;
    if (opts.endUserId !== undefined) body.end_user_id = opts.endUserId;
    if (opts.owner !== undefined) body.owner = opts.owner;
    if (opts.customAttrs !== undefined) body.custom_attrs = opts.customAttrs;
    if (opts.openedAt !== undefined) body.opened_at = opts.openedAt;
    const res = await this.http.post<{ case: Case }>('/v1/cases', body);
    return res.case;
  }

  /** Fetch one case with its linked runs. */
  async get(id: string): Promise<CaseWithRuns> {
    const res = await this.http.get<{ case: CaseWithRuns }>(`/v1/cases/${id}`);
    return res.case;
  }

  async createEvent(caseId: string, opts: CreateWorkflowEventOptions): Promise<WorkflowEvent> {
    const res = await this.http.post<{ event: WorkflowEvent }>(
      `/v1/cases/${caseId}/events`,
      workflowEventBody(opts),
    );
    return res.event;
  }

  async listEvents(
    caseId: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<WorkflowEvent>> {
    return this.http.get<ListResponse<WorkflowEvent>>(
      pagePath(`/v1/cases/${caseId}/events`, opts),
    );
  }

  /** List cases. Filters mirror the server query params. */
  async list(
    opts: PageOptions & {
      tenantId?: string;
      endUserId?: string;
      workflowKey?: string;
      status?: CaseStatus;
      outcome?: string;
    } = {},
  ): Promise<ListResponse<Case>> {
    const params: Record<string, string | number | undefined> = {
      cursor: opts.cursor,
      limit: opts.limit,
    };
    if (opts.tenantId) params.tenant_id = opts.tenantId;
    if (opts.endUserId) params.end_user_id = opts.endUserId;
    if (opts.workflowKey) params.workflow_key = opts.workflowKey;
    if (opts.status) params.status = opts.status;
    if (opts.outcome) params.outcome = opts.outcome;
    return this.http.get<ListResponse<Case>>(pagePath('/v1/cases', params));
  }

  async update(id: string, opts: UpdateCaseOptions): Promise<Case> {
    const body: Record<string, unknown> = {};
    if (opts.status !== undefined) body.status = opts.status;
    if (opts.outcome !== undefined) body.outcome = opts.outcome;
    if (opts.outcomeValueUsd !== undefined) body.outcome_value_usd = opts.outcomeValueUsd;
    if (opts.owner !== undefined) body.owner = opts.owner;
    if (opts.customAttrs !== undefined) body.custom_attrs = opts.customAttrs;
    if (opts.closedAt !== undefined) body.closed_at = opts.closedAt;
    const res = await this.http.patch<{ case: Case }>(`/v1/cases/${id}`, body);
    return res.case;
  }

  /** Convenience: status="closed" + outcome in one call. */
  async close(id: string, opts: CloseCaseOptions): Promise<Case> {
    return this.update(id, {
      status: 'closed',
      outcome: opts.outcome,
      outcomeValueUsd: opts.valueUsd,
      closedAt: opts.closedAt,
    });
  }

  /**
   * Run `fn` with a case context active. Any `inv.runs.start(...)` invoked
   * inside the callback (transitively) is auto-stamped with `case_id`,
   * `tenant_id`, and `end_user_id` from this case — no need to thread the id
   * through callers manually.
   */
  async with<T>(caseOrId: Case | string, fn: () => Promise<T>): Promise<T> {
    let state: CaseContextState;
    if (typeof caseOrId === 'string') {
      const c = await this.get(caseOrId);
      state = { caseId: c.id, tenantId: c.tenant_id, endUserId: c.end_user_id };
    } else {
      state = {
        caseId: caseOrId.id,
        tenantId: caseOrId.tenant_id,
        endUserId: caseOrId.end_user_id,
      };
    }
    return currentCase.run(state, fn);
  }
}

/**
 * Re-exported for ergonomic destructuring in user code:
 *
 *   const c = await inv.cases.create({ workflowKey: 'mortgage.refi', tenantId: 'acme' });
 *   await inv.cases.with(c, async () => {
 *     await inv.runs.start({ name: 'underwrite' }, async (run) => { ... });
 *   });
 *   await inv.cases.close(c.id, { outcome: 'approved', valueUsd: 12_500 });
 */
export type { ListResponse } from './runs.js';
export type { RunClient };
