import type { HttpClient } from '../client.js';
import type { Run, ListResponse } from './runs.js';
import { RunsResource, type RunClient } from './runs.js';
import { MonitorsResource } from './monitors.js';
import { FindingsResource, type Finding } from './findings.js';
import type { Severity } from './monitors.js';
import { withQuery, pagePath, type PageOptions } from './query.js';

// ── Eval primitives (backend types — mirrored from @invariance/api-types) ──

export type EvalTargetType =
  | 'graph'
  | 'monitor'
  | 'recipe'
  | 'finding'
  | 'summary'
  | 'guardrail'
  | 'custom';

export type EvalSuiteRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'errored';
export type EvalResultStatus = 'passed' | 'failed' | 'errored';
export type EvalScorerKind = 'assertion' | 'code' | 'llm' | 'builtin';

export interface EvalSuite {
  id: string;
  agent_id: string;
  dataset_id: string | null;
  name: string;
  description: string;
  target_type: EvalTargetType;
  scorer_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalDataset {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalAssertion {
  path: string;
  op:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'present'
    | 'absent'
    | 'count_eq'
    | 'count_gte'
    | 'count_lte';
  value?: unknown;
  message?: string;
}

export interface EvalExpectedOutput {
  entities?: Array<{ kind: string; key?: string; label?: string }>;
  edges?: Array<{ kind: string; from_kind?: string; to_kind?: string }>;
  findings?: Array<{ kind: string; severity?: Severity }>;
  missing_controls?: Array<{ kind: string }>;
  guardrails?: Array<{ kind: string; outcome?: 'pass' | 'fail' }>;
  summaries?: Array<{ contains?: string; equals?: string }>;
  assertions?: EvalAssertion[];
}

export interface EvalDatasetExample {
  id: string;
  dataset_id: string;
  agent_id: string;
  input: Record<string, unknown>;
  expected: EvalExpectedOutput | Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalScorer {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  kind: EvalScorerKind;
  definition: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CounterfactualReplayMutation =
  | { kind: 'replace_prompt'; node_id?: string; value: string }
  | { kind: 'replace_context'; node_id?: string; value: unknown }
  | { kind: 'patch_node_input'; node_id: string; path: string; value: unknown }
  | { kind: 'patch_node_output'; node_id: string; path: string; value: unknown }
  | { kind: 'patch_node_metadata'; node_id: string; path: string; value: unknown }
  | { kind: 'drop_node'; node_id: string }
  | { kind: 'insert_node'; after_node_id?: string; node: Record<string, unknown> };

export interface EvalCase {
  id: string;
  suite_id: string;
  agent_id: string;
  dataset_example_id: string | null;
  source_run_id: string | null;
  source_finding_id: string | null;
  source_graph_ref: string | null;
  name: string;
  input_bundle: Record<string, unknown>;
  mutations: CounterfactualReplayMutation[];
  expected: EvalExpectedOutput;
  assertions: EvalAssertion[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalRun {
  id: string;
  suite_id: string;
  agent_id: string;
  target_type: EvalTargetType;
  target_ref: string | null;
  status: EvalSuiteRunStatus;
  summary: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EvalResultFailure {
  message: string;
  path?: string;
  observed?: unknown;
  expected?: unknown;
}

export interface EvalResultRow {
  id: string;
  eval_run_id: string;
  case_id: string;
  agent_id: string;
  status: EvalResultStatus;
  scores: Record<string, number>;
  failures: EvalResultFailure[];
  observed: Record<string, unknown>;
  expected: Record<string, unknown>;
  replay_run_id: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Request shapes ─────────────────────────────────────────────────────────

export interface CreateEvalSuiteInput {
  name: string;
  description?: string;
  target_type: EvalTargetType;
  dataset_id?: string | null;
  scorer_ids?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateEvalDatasetInput {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AppendDatasetExampleInput {
  input: Record<string, unknown>;
  expected?: EvalExpectedOutput | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateEvalScorerInput {
  name: string;
  description?: string;
  kind: EvalScorerKind;
  definition?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateEvalCaseInput {
  name: string;
  dataset_example_id?: string;
  source_run_id?: string;
  source_finding_id?: string;
  source_graph_ref?: string;
  input_bundle?: Record<string, unknown>;
  mutations?: CounterfactualReplayMutation[];
  expected?: EvalExpectedOutput;
  assertions?: EvalAssertion[];
  metadata?: Record<string, unknown>;
}

export interface CreateEvalCaseFromRunInput {
  name?: string;
  source_run_id: string;
  mutations?: CounterfactualReplayMutation[];
  expected?: EvalExpectedOutput;
  assertions?: EvalAssertion[];
  metadata?: Record<string, unknown>;
}

export interface StartEvalRunInput {
  metadata?: Record<string, unknown>;
}

// ── Experiment shapes (depend on backend task #1 — names TBD, finalized
// when backend SendMessage announces them. Keep loose until confirmed.) ────

/** Identifier for a built-in scorer plus optional config (e.g. `numeric_tolerance: { tolerance: 0.1 }`). */
export interface ScorerSpec {
  name: string;
  config?: Record<string, unknown>;
}

export interface ExperimentRunRequest {
  scorers: ScorerSpec[];
  baseline_run_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ExperimentRunResponse {
  eval_run: EvalRun;
}

export interface ExperimentCompareCaseDelta {
  case_id: string;
  scores: Record<string, { baseline: number | null; current: number | null; delta: number | null }>;
  status_baseline: EvalResultStatus | null;
  status_current: EvalResultStatus | null;
}

export interface CompareResponse {
  baseline_run_id: string;
  current_run_id: string;
  aggregate: Record<string, { baseline: number | null; current: number | null; delta: number | null }>;
  cases: ExperimentCompareCaseDelta[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const FAIL_THRESHOLD: Severity = 'medium';

export interface EvalMetadata {
  suite: string;
  case: string;
  expected?: unknown;
  inputs?: unknown;
  tags?: string[];
}

export interface EvalRunCaseOptions {
  suite: string;
  case: string;
  expected?: unknown;
  inputs?: unknown;
  tags?: string[];
  /** Monitor IDs to evaluate against the run after the handler completes. */
  monitorIds?: string[];
  /** Optional run name (defaults to `eval:<suite>:<case>`). */
  name?: string;
  /** Caller-supplied logic that produces nodes inside the run. */
  handler: (run: RunClient) => Promise<void>;
  /** Extra metadata merged alongside `eval`. */
  metadata?: Record<string, unknown>;
}

export type EvalStatus = 'pass' | 'fail';

export interface EvalResult {
  run_id: string;
  suite: string;
  case: string;
  status: EvalStatus;
  findings: Finding[];
}

export interface EvalCaseRecord {
  run_id: string;
  case: string;
  status: EvalStatus;
  created_at: string;
}

export interface EvalListResponse {
  suite: string;
  runs: EvalCaseRecord[];
  next_cursor: string | null;
}

export interface EvalSummary {
  suite: string;
  total: number;
  passed: number;
  failed: number;
}

export function readEvalMetadata(run: Pick<Run, 'metadata'>): EvalMetadata | null {
  const e = run.metadata?.['eval'];
  if (!e || typeof e !== 'object') return null;
  const ev = e as Record<string, unknown>;
  if (typeof ev.suite !== 'string' || typeof ev.case !== 'string') return null;
  return {
    suite: ev.suite,
    case: ev.case,
    expected: ev.expected,
    inputs: ev.inputs,
    tags: Array.isArray(ev.tags) ? (ev.tags as string[]) : undefined,
  };
}

export function deriveStatus(findings: Finding[]): EvalStatus {
  const threshold = SEVERITY_ORDER[FAIL_THRESHOLD];
  for (const f of findings) {
    if (f.status !== 'open' && f.status !== 'review_requested') continue;
    if (SEVERITY_ORDER[f.severity] >= threshold) return 'fail';
  }
  return 'pass';
}

export class EvalsResource {
  private readonly runsResource: RunsResource;
  private readonly monitors: MonitorsResource;
  private readonly findings: FindingsResource;

  readonly datasets: EvalDatasetsNamespace;
  readonly scorers: EvalScorersNamespace;
  readonly suites: EvalSuitesNamespace;
  readonly cases: EvalCasesNamespace;
  readonly runs: EvalRunsNamespace;
  readonly experiments: EvalExperimentsNamespace;

  constructor(private readonly http: HttpClient, runs: RunsResource) {
    this.runsResource = runs;
    this.monitors = new MonitorsResource(http);
    this.findings = new FindingsResource(http);
    this.datasets = new EvalDatasetsNamespace(http);
    this.scorers = new EvalScorersNamespace(http);
    this.suites = new EvalSuitesNamespace(http);
    this.cases = new EvalCasesNamespace(http);
    this.runs = new EvalRunsNamespace(http);
    this.experiments = new EvalExperimentsNamespace(http);
  }

  async runCase(opts: EvalRunCaseOptions): Promise<EvalResult> {
    const evalMeta: EvalMetadata = {
      suite: opts.suite,
      case: opts.case,
      expected: opts.expected,
      inputs: opts.inputs,
      tags: opts.tags,
    };
    const metadata = { ...(opts.metadata ?? {}), eval: evalMeta };
    const name = opts.name ?? `eval:${opts.suite}:${opts.case}`;

    const client = await this.runsResource.start({ name, metadata });
    let runId = client.runId;
    try {
      await opts.handler(client);
      const finished = await client.finish();
      runId = finished.id;
    } catch (err) {
      try {
        await client.fail(err instanceof Error ? err.message : String(err));
      } catch {
        // ignore — original error wins
      }
      throw err;
    }

    if (opts.monitorIds?.length) {
      for (const id of opts.monitorIds) {
        await this.monitors.evaluate(id, { run_id: runId });
      }
    }

    const findings = await this.findingsForRun(runId);
    return {
      run_id: runId,
      suite: opts.suite,
      case: opts.case,
      status: deriveStatus(findings),
      findings,
    };
  }

  async listCases(opts: {
    suite: string;
    limit?: number;
    cursor?: string;
  }): Promise<EvalListResponse> {
    const path = withQuery('/v1/runs', {
      eval_suite: opts.suite,
      limit: opts.limit,
      cursor: opts.cursor,
    });
    const res = await this.http.get<ListResponse<Run>>(path);
    const records: EvalCaseRecord[] = [];
    for (const run of res.data) {
      const meta = readEvalMetadata(run);
      if (!meta) continue;
      const findings = await this.findingsForRun(run.id);
      records.push({
        run_id: run.id,
        case: meta.case,
        status: deriveStatus(findings),
        created_at: run.created_at,
      });
    }
    return { suite: opts.suite, runs: records, next_cursor: res.next_cursor };
  }

  async summarize(suite: string): Promise<EvalSummary> {
    let cursor: string | undefined;
    let passed = 0;
    let failed = 0;
    for (let page = 0; page < 20; page++) {
      const res: EvalListResponse = await this.listCases({ suite, cursor, limit: 100 });
      for (const r of res.runs) {
        if (r.status === 'pass') passed++;
        else failed++;
      }
      if (!res.next_cursor) break;
      cursor = res.next_cursor;
    }
    return { suite, total: passed + failed, passed, failed };
  }

  private async findingsForRun(runId: string): Promise<Finding[]> {
    const res = await this.http.get<ListResponse<Finding>>(
      withQuery('/v1/findings', { run_id: runId, limit: 100 }),
    );
    return res.data;
  }
}

// ── Namespace classes ──────────────────────────────────────────────────────

export class EvalDatasetsNamespace {
  constructor(private readonly http: HttpClient) {}

  async list(opts: PageOptions = {}): Promise<ListResponse<EvalDataset>> {
    return this.http.get(pagePath('/v1/eval-datasets', opts));
  }

  async get(id: string): Promise<EvalDataset> {
    const res = await this.http.get<{ dataset: EvalDataset }>(`/v1/eval-datasets/${id}`);
    return res.dataset;
  }

  async create(input: CreateEvalDatasetInput): Promise<EvalDataset> {
    const res = await this.http.post<{ dataset: EvalDataset }>('/v1/eval-datasets', input);
    return res.dataset;
  }

  async appendRows(
    datasetId: string,
    rows: AppendDatasetExampleInput | AppendDatasetExampleInput[],
  ): Promise<EvalDatasetExample[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const out: EvalDatasetExample[] = [];
    for (const row of list) {
      const res = await this.http.post<{ example: EvalDatasetExample }>(
        `/v1/eval-datasets/${datasetId}/examples`,
        row,
      );
      out.push(res.example);
    }
    return out;
  }

  async listExamples(
    datasetId: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<EvalDatasetExample>> {
    return this.http.get(pagePath(`/v1/eval-datasets/${datasetId}/examples`, opts));
  }
}

export class EvalScorersNamespace {
  constructor(private readonly http: HttpClient) {}

  async list(opts: PageOptions = {}): Promise<ListResponse<EvalScorer>> {
    return this.http.get(pagePath('/v1/eval-scorers', opts));
  }

  async create(input: CreateEvalScorerInput): Promise<EvalScorer> {
    const res = await this.http.post<{ scorer: EvalScorer }>('/v1/eval-scorers', input);
    return res.scorer;
  }
}

export class EvalSuitesNamespace {
  constructor(private readonly http: HttpClient) {}

  async list(opts: PageOptions = {}): Promise<ListResponse<EvalSuite>> {
    return this.http.get(pagePath('/v1/eval-suites', opts));
  }

  async get(id: string): Promise<EvalSuite> {
    const res = await this.http.get<{ suite: EvalSuite }>(`/v1/eval-suites/${id}`);
    return res.suite;
  }

  async create(input: CreateEvalSuiteInput): Promise<EvalSuite> {
    const res = await this.http.post<{ suite: EvalSuite }>('/v1/eval-suites', input);
    return res.suite;
  }
}

export class EvalCasesNamespace {
  constructor(private readonly http: HttpClient) {}

  async create(suiteId: string, input: CreateEvalCaseInput): Promise<EvalCase> {
    const res = await this.http.post<{ case: EvalCase }>(
      `/v1/eval-suites/${suiteId}/cases`,
      input,
    );
    return res.case;
  }

  async createFromRun(suiteId: string, input: CreateEvalCaseFromRunInput): Promise<EvalCase> {
    const res = await this.http.post<{ case: EvalCase }>(
      `/v1/eval-suites/${suiteId}/cases/from-run`,
      input,
    );
    return res.case;
  }

  async list(suiteId: string, opts: PageOptions = {}): Promise<ListResponse<EvalCase>> {
    return this.http.get(pagePath(`/v1/eval-suites/${suiteId}/cases`, opts));
  }
}

export class EvalRunsNamespace {
  constructor(private readonly http: HttpClient) {}

  async start(suiteId: string, input: StartEvalRunInput = {}): Promise<EvalRun> {
    const res = await this.http.post<{ eval_run: EvalRun }>(
      `/v1/eval-suites/${suiteId}/run`,
      input,
    );
    return res.eval_run;
  }

  async get(runId: string): Promise<EvalRun> {
    const res = await this.http.get<{ eval_run: EvalRun }>(`/v1/eval-runs/${runId}`);
    return res.eval_run;
  }

  async listResults(
    runId: string,
    opts: PageOptions = {},
  ): Promise<ListResponse<EvalResultRow>> {
    return this.http.get(pagePath(`/v1/eval-runs/${runId}/results`, opts));
  }
}

/**
 * Experiment routes. Depend on backend task #1 (POST /v1/eval-runs/:id/experiment,
 * GET /v1/eval-runs/:id/compare). Request/response shapes are mirrored loosely
 * here and may be refined once the backend teammate finalizes ScorerSpec /
 * ExperimentRunRequest / CompareResponse in @invariance/api-types.
 */
export class EvalExperimentsNamespace {
  constructor(private readonly http: HttpClient) {}

  async run(runId: string, input: ExperimentRunRequest): Promise<EvalRun> {
    const res = await this.http.post<ExperimentRunResponse>(
      `/v1/eval-runs/${runId}/experiment`,
      input,
    );
    return res.eval_run;
  }

  async compare(runId: string, baselineRunId: string): Promise<CompareResponse> {
    return this.http.get(
      withQuery(`/v1/eval-runs/${runId}/compare`, { baseline: baselineRunId }),
    );
  }
}
