import type { HttpClient } from '../client.js';
import type { Run, ListResponse } from './runs.js';
import { RunsResource, type RunClient } from './runs.js';
import { MonitorsResource } from './monitors.js';
import { FindingsResource, type Finding } from './findings.js';
import type { Severity } from './monitors.js';
import { withQuery } from './query.js';

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
  private readonly runs: RunsResource;
  private readonly monitors: MonitorsResource;
  private readonly findings: FindingsResource;

  constructor(private readonly http: HttpClient, runs: RunsResource) {
    this.runs = runs;
    this.monitors = new MonitorsResource(http);
    this.findings = new FindingsResource(http);
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

    const client = await this.runs.start({ name, metadata });
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
