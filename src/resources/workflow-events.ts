import type { HttpClient } from '../client.js';
import { pagePath, withQuery, type PageOptions } from './query.js';
import type { ListResponse } from './runs.js';

export type WorkflowEventActorType =
  | 'human'
  | 'agent'
  | 'llm'
  | 'service'
  | 'integration'
  | 'policy'
  | 'system';

export type EvidenceRefKind =
  | 'run'
  | 'node'
  | 'ticket'
  | 'doc'
  | 'slack'
  | 'github'
  | 'meeting'
  | 'url'
  | 'external';

export interface WorkflowEvidenceRef {
  kind: EvidenceRefKind;
  id?: string;
  url?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowEvent {
  id: string;
  agent_id: string;
  case_id: string;
  tenant_id: string | null;
  end_user_id: string | null;
  workflow_key: string;
  type: string;
  actor_type: WorkflowEventActorType | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  evidence_node_ids: string[];
  evidence_refs: WorkflowEvidenceRef[];
  occurred_at: string;
  created_at: string;
}

export interface CreateWorkflowEventOptions {
  type: string;
  actorType?: WorkflowEventActorType | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  evidenceNodeIds?: string[];
  evidenceRefs?: WorkflowEvidenceRef[];
  occurredAt?: string;
}

export interface WorkflowEventListOptions extends PageOptions {
  caseId?: string;
  tenantId?: string;
  endUserId?: string;
  workflowKey?: string;
  type?: string;
  actorType?: WorkflowEventActorType;
  actorId?: string;
}

export function workflowEventBody(opts: CreateWorkflowEventOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { type: opts.type };
  if (opts.actorType !== undefined) body.actor_type = opts.actorType;
  if (opts.actorId !== undefined) body.actor_id = opts.actorId;
  if (opts.payload !== undefined) body.payload = opts.payload;
  if (opts.evidenceNodeIds !== undefined) body.evidence_node_ids = opts.evidenceNodeIds;
  if (opts.evidenceRefs !== undefined) body.evidence_refs = opts.evidenceRefs;
  if (opts.occurredAt !== undefined) body.occurred_at = opts.occurredAt;
  return body;
}

export function workflowEventListPath(path: string, opts: WorkflowEventListOptions = {}): string {
  return withQuery(path, {
    cursor: opts.cursor,
    limit: opts.limit,
    case_id: opts.caseId,
    tenant_id: opts.tenantId,
    end_user_id: opts.endUserId,
    workflow_key: opts.workflowKey,
    type: opts.type,
    actor_type: opts.actorType,
    actor_id: opts.actorId,
  });
}

export class WorkflowEventsResource {
  constructor(private readonly http: HttpClient) {}

  async create(caseId: string, opts: CreateWorkflowEventOptions): Promise<WorkflowEvent> {
    const res = await this.http.post<{ event: WorkflowEvent }>(
      `/v1/cases/${caseId}/events`,
      workflowEventBody(opts),
    );
    return res.event;
  }

  async list(opts: WorkflowEventListOptions = {}): Promise<ListResponse<WorkflowEvent>> {
    return this.http.get<ListResponse<WorkflowEvent>>(workflowEventListPath('/v1/events', opts));
  }

  async listForCase(
    caseId: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<WorkflowEvent>> {
    return this.http.get<ListResponse<WorkflowEvent>>(
      pagePath(`/v1/cases/${caseId}/events`, opts),
    );
  }
}

