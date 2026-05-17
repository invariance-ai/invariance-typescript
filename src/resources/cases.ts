import { AsyncLocalStorage } from 'node:async_hooks';
import type { HttpClient } from '../client.js';
import { pagePath, type PageOptions } from './query.js';
import type { ListResponse, Node, Run } from './runs.js';

export type CaseStatus = 'open' | 'closed';
export type ActorType = 'human' | 'agent' | 'llm' | 'service' | 'integration' | 'system';

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

export interface EvidenceRef {
  source: string;
  id: string;
  url?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowEvent {
  id: string;
  case_id: string;
  type: string;
  actor_type: ActorType | null;
  actor_id: string | null;
  ts: string;
  payload: Record<string, unknown>;
  evidence_node_ids: string[];
  evidence_refs: EvidenceRef[];
  created_at: string;
}

export interface Actor {
  type: ActorType;
  id: string;
  label?: string;
  evidence_count: number;
}

export interface CaseOutcome {
  status: CaseStatus;
  outcome: string | null;
  value_usd: number | null;
  closed_at: string | null;
}

export interface CaseEvidence {
  case: Case;
  runs: Run[];
  nodes: Node[];
  events: WorkflowEvent[];
  actors: Actor[];
  outcome: CaseOutcome | null;
}

export interface CreateCaseOptions {
  workflowKey: string;
  id?: string;
  tenantId?: string | null;
  endUserId?: string | null;
  owner?: string | null;
  customAttrs?: Record<string, unknown>;
  openedAt?: string;
}

export interface UpdateCaseOptions {
  status?: CaseStatus;
  outcome?: string | null;
  outcomeValueUsd?: number | null;
  owner?: string | null;
  customAttrs?: Record<string, unknown> | null;
  closedAt?: string | null;
}

export interface CloseCaseOptions {
  outcome: string;
  valueUsd?: number;
  closedAt?: string;
}

export interface CreateWorkflowEventOptions {
  type: string;
  actorType?: ActorType;
  actorId?: string | null;
  ts?: string;
  payload?: Record<string, unknown>;
  evidenceNodeIds?: string[];
  evidenceRefs?: EvidenceRef[];
}

interface CaseContextState {
  caseId: string;
  tenantId: string | null;
  endUserId: string | null;
}

const currentCase = new AsyncLocalStorage<CaseContextState>();

export function activeCaseContext(): CaseContextState | undefined {
  return currentCase.getStore();
}

export class CasesResource {
  constructor(private readonly http: HttpClient) {}

  async create(opts: CreateCaseOptions): Promise<Case> {
    const body: Record<string, unknown> = { workflow_key: opts.workflowKey };
    if (opts.id !== undefined) body.id = opts.id;
    if (opts.tenantId !== undefined) body.tenant_id = opts.tenantId;
    if (opts.endUserId !== undefined) body.end_user_id = opts.endUserId;
    if (opts.owner !== undefined) body.owner = opts.owner;
    if (opts.customAttrs !== undefined) body.custom_attrs = opts.customAttrs;
    if (opts.openedAt !== undefined) body.opened_at = opts.openedAt;
    const res = await this.http.post<{ case: Case }>('/v1/cases', body);
    return res.case;
  }

  async get(id: string): Promise<CaseWithRuns> {
    const res = await this.http.get<{ case: CaseWithRuns }>(`/v1/cases/${id}`);
    return res.case;
  }

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

  async close(id: string, opts: CloseCaseOptions): Promise<Case> {
    return this.update(id, {
      status: 'closed',
      outcome: opts.outcome,
      outcomeValueUsd: opts.valueUsd,
      closedAt: opts.closedAt,
    });
  }

  async evidence(id: string): Promise<CaseEvidence> {
    return this.http.get<CaseEvidence>(`/v1/cases/${id}/evidence`);
  }

  async listEvents(id: string): Promise<WorkflowEvent[]> {
    const res = await this.http.get<{ data: WorkflowEvent[] }>(`/v1/cases/${id}/events`);
    return res.data;
  }

  async createEvent(id: string, opts: CreateWorkflowEventOptions): Promise<WorkflowEvent> {
    const body: Record<string, unknown> = { type: opts.type };
    if (opts.actorType !== undefined) body.actor_type = opts.actorType;
    if (opts.actorId !== undefined) body.actor_id = opts.actorId;
    if (opts.ts !== undefined) body.ts = opts.ts;
    if (opts.payload !== undefined) body.payload = opts.payload;
    if (opts.evidenceNodeIds !== undefined) body.evidence_node_ids = opts.evidenceNodeIds;
    if (opts.evidenceRefs !== undefined) body.evidence_refs = opts.evidenceRefs;
    const res = await this.http.post<{ event: WorkflowEvent }>(`/v1/cases/${id}/events`, body);
    return res.event;
  }

  async with<T>(caseOrId: Case | string, fn: () => Promise<T>): Promise<T> {
    const c = typeof caseOrId === 'string' ? await this.get(caseOrId) : caseOrId;
    return currentCase.run({
      caseId: c.id,
      tenantId: c.tenant_id,
      endUserId: c.end_user_id,
    }, fn);
  }
}
