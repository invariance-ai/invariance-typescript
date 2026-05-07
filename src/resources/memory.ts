import type { HttpClient } from '../client.js';

// ── Subject + source enums ──────────────────────────────────────────────────

export type MemorySubjectType =
  | 'customer'
  | 'account'
  | 'user'
  | 'policy'
  | 'workflow'
  | 'preference';

export type MemorySource =
  | 'agent_write'
  | 'human_write'
  | 'crm'
  | 'ticket'
  | 'policy_doc'
  | 'external_system';

export type MemoryAccessType = 'read' | 'write';

export type MemoryDivergenceKind =
  | 'stale_memory'
  | 'contradicted_memory'
  | 'unsupported_memory'
  | 'overgeneralized_memory'
  | 'memory_used_without_source'
  | 'memory_caused_bad_action'
  | 'memory_not_updated_after_ground_truth_change';

export type MemoryDivergenceStatus = 'open' | 'dismissed' | 'resolved';

// ── Records ────────────────────────────────────────────────────────────────

export interface EvidenceRef {
  kind: 'node' | 'tool_call' | 'llm_call' | 'document' | 'system_record';
  id: string;
  uri?: string;
  excerpt?: string;
}

export interface SystemRecord {
  source: MemorySource;
  external_id: string;
  fetched_at: string;
  fields: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  agent_id: string;
  subject_type: MemorySubjectType;
  subject_id: string;
  claim: string;
  value: unknown;
  source: MemorySource;
  confidence: number;
  valid_from: string;
  valid_until: string | null;
  last_verified_at: string | null;
  superseded_by: string | null;
  provenance: EvidenceRef[];
}

export interface MemoryAccess {
  id: string;
  run_id: string;
  node_id: string;
  agent_id: string;
  access_type: MemoryAccessType;
  subject_type: MemorySubjectType;
  subject_id: string;
  key: string;
  value: unknown;
  used_for: string;
  source_node_id: string | null;
  timestamp: string;
}

export interface MemoryDivergence {
  id: string;
  org_id: string;
  memory_record_id: string;
  divergence_kind: MemoryDivergenceKind;
  detected_at: string;
  affected_run_ids: string[];
  evidence: EvidenceRef[];
  status: MemoryDivergenceStatus;
}

// ── SDK input shapes ───────────────────────────────────────────────────────

export interface MemoryReadInput {
  run_id?: string;
  node_id?: string;
  subject_type: MemorySubjectType;
  subject_id: string;
  key: string;
  used_for: string;
}

export interface MemoryWriteInput {
  run_id?: string;
  node_id?: string;
  subject_type: MemorySubjectType;
  subject_id: string;
  key: string;
  value: unknown;
  used_for: string;
  source?: MemorySource;
  confidence?: number;
  provenance?: EvidenceRef[];
  valid_until?: string | null;
}

export interface MemoryReadResponse {
  access: MemoryAccess;
  record: MemoryRecord | null;
}

export interface MemoryWriteResponse {
  access: MemoryAccess;
  record: MemoryRecord;
}

interface MemoryReadBody {
  run_id?: string;
  node_id?: string;
  subject_type: MemorySubjectType;
  subject_id: string;
  key: string;
  used_for: string;
}

interface MemoryWriteBody extends MemoryReadBody {
  value: unknown;
  source: MemorySource;
  confidence: number;
  provenance?: EvidenceRef[];
  valid_until?: string | null;
}

function envIds(): { run_id?: string; node_id?: string } {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return {
    run_id: env?.INVARIANCE_RUN_ID,
    node_id: env?.INVARIANCE_NODE_ID,
  };
}

export function buildMemoryReadBody(input: MemoryReadInput): MemoryReadBody {
  const env = envIds();
  const body: MemoryReadBody = {
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    key: input.key,
    used_for: input.used_for,
  };
  const run_id = input.run_id ?? env.run_id;
  const node_id = input.node_id ?? env.node_id;
  if (run_id !== undefined) body.run_id = run_id;
  if (node_id !== undefined) body.node_id = node_id;
  return body;
}

export function buildMemoryWriteBody(input: MemoryWriteInput): MemoryWriteBody {
  const base = buildMemoryReadBody(input);
  const body: MemoryWriteBody = {
    ...base,
    value: input.value,
    source: input.source ?? 'agent_write',
    confidence: input.confidence ?? 1.0,
  };
  if (input.provenance !== undefined) body.provenance = input.provenance;
  if (input.valid_until !== undefined) body.valid_until = input.valid_until;
  return body;
}

export class MemoryResource {
  constructor(private readonly http: HttpClient) {}

  async read(input: MemoryReadInput): Promise<MemoryReadResponse> {
    return this.http.post<MemoryReadResponse>('/v1/memory/read', buildMemoryReadBody(input));
  }

  async write(input: MemoryWriteInput): Promise<MemoryWriteResponse> {
    return this.http.post<MemoryWriteResponse>('/v1/memory/write', buildMemoryWriteBody(input));
  }
}
