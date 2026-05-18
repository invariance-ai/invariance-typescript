import type { HttpClient } from '../client.js';

/**
 * Generic Cortex job kinds for evals, counterfactuals, experiments, and attribution.
 *
 * See the plan doc for the full taxonomy. Use string literals here rather than an
 * enum so callers can pass plain JSON and the SDK remains tree-shakeable.
 */
export type CortexJobKind =
  | 'workflow_eval'
  | 'counterfactual_eval'
  | 'workflow_experiment'
  | 'outcome_attribution'
  | 'recommendation_impact_eval'
  | 'prompt_variant_eval'
  | 'policy_eval';

/** What the job runs against. `external` covers customer-owned objects. */
export type CortexTargetType =
  | 'run'
  | 'case'
  | 'workflow'
  | 'step'
  | 'agent'
  | 'prompt'
  | 'policy'
  | 'recommendation'
  | 'external';

/** Lifecycle states a Cortex job moves through. */
export type CortexJobStatus =
  | 'queued'
  | 'leased'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'dead'
  | 'cancelled';

export interface CortexJobCriteria {
  optimize_for?: string[];
  constraints?: string[];
  [key: string]: unknown;
}

export interface CortexJobInputRefs {
  run_ids?: string[];
  case_ids?: string[];
  chunk_ids?: string[];
  node_ids?: string[];
  [key: string]: unknown;
}

export interface CortexJobOptions {
  use_llm?: boolean;
  create_surface_item?: boolean;
  [key: string]: unknown;
}

export interface CreateCortexJobInput {
  project_id: string;
  job_kind: CortexJobKind;
  target_type: CortexTargetType;
  target_ref: string;
  question?: string;
  criteria?: CortexJobCriteria;
  input_refs?: CortexJobInputRefs;
  input_payload?: Record<string, unknown>;
  options?: CortexJobOptions;
}

/** Minimal job record returned by create / get. */
export interface CortexJob {
  id: string;
  status: CortexJobStatus;
  job_kind?: CortexJobKind;
  target_type?: CortexTargetType;
  target_ref?: string;
  project_id?: string;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
}

// --- Result shapes (discriminated by `kind`) -----------------------------

export interface CortexCriterionResult {
  criterion: string;
  passed: boolean;
  evidence_refs?: string[];
  notes?: string;
}

export interface WorkflowEvalResult {
  kind: 'workflow_eval';
  passed: boolean;
  score?: number;
  criteria_results: CortexCriterionResult[];
  findings?: unknown[];
  confidence?: number;
}

export interface CounterfactualEvalResult {
  kind: 'counterfactual_eval';
  /** Plain-English summary; the field is optional in the spec but Eyes relies on it. */
  answer?: string;
  observed_outcome: string;
  hypothetical_change: string;
  estimated_outcome?: string;
  estimated_impact?: Record<string, unknown>;
  assumptions: string[];
  evidence_refs: string[];
  confidence: number;
  uncertainty?: string;
}

export interface OutcomeAttributionFactor {
  factor: string;
  impact: 'low' | 'medium' | 'high' | string;
  evidence_refs?: string[];
}

export interface OutcomeAttributionResult {
  kind: 'outcome_attribution';
  outcome: string;
  primary_factors: OutcomeAttributionFactor[];
  confidence?: number;
}

export type CortexJobResultPayload =
  | WorkflowEvalResult
  | CounterfactualEvalResult
  | OutcomeAttributionResult;

export interface CortexJobResult {
  job_id: string;
  status: CortexJobStatus;
  result?: CortexJobResultPayload | null;
  error?: string | null;
}

export interface CreateCortexJobResponse {
  job_id: string;
  status: CortexJobStatus;
  deduplicated: boolean;
}

export class CortexJobsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Enqueue a Cortex job. Returns `{ job_id, status }` immediately;
   * poll `get(jobId)` / `result(jobId)` for completion.
   */
  async create(input: CreateCortexJobInput): Promise<CreateCortexJobResponse> {
    return this.http.post<CreateCortexJobResponse>('/v1/cortex/jobs', input);
  }

  /** Fetch job lifecycle/status without the result body. */
  async get(jobId: string): Promise<CortexJob> {
    const res = await this.http.get<CortexJob | { job: CortexJob }>(
      `/v1/cortex/jobs/${encodeURIComponent(jobId)}`,
    );
    return 'job' in res ? res.job : res;
  }

  /**
   * Fetch the structured result. Returns `result: undefined` while the job is
   * still queued/running — callers should branch on `status`.
   */
  async result(jobId: string): Promise<CortexJobResult> {
    return this.http.get<CortexJobResult>(
      `/v1/cortex/jobs/${encodeURIComponent(jobId)}/result`,
    );
  }
}

/** Container exposed as `client.cortex` — currently only `jobs`. */
export class CortexResource {
  readonly jobs: CortexJobsResource;

  constructor(http: HttpClient) {
    this.jobs = new CortexJobsResource(http);
  }
}
