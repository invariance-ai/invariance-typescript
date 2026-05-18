import { describe, it, expect } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';
import type {
  CounterfactualEvalResult,
  CortexJob,
  CortexJobResult,
  WorkflowEvalResult,
} from './cortex.js';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function stubbed(responses: Record<string, unknown> = {}): {
  inv: Invariance;
  calls: Call[];
} {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { cortex: { jobs: { http: HttpClient } } }).cortex.jobs.http;

  (http as unknown as { post: unknown }).post = async (p: string, b?: unknown) => {
    calls.push({ method: 'POST', path: p, body: b });
    return responses[`POST ${p}`] ?? { job_id: 'ctxjob_1', status: 'queued' };
  };
  (http as unknown as { get: unknown }).get = async (p: string) => {
    calls.push({ method: 'GET', path: p });
    return responses[`GET ${p}`] ?? { job_id: 'ctxjob_1', status: 'succeeded' };
  };
  return { inv, calls };
}

describe('CortexJobsResource.create', () => {
  it('POSTs /v1/cortex/jobs with the full request body for a counterfactual', async () => {
    const { inv, calls } = stubbed({
      'POST /v1/cortex/jobs': {
        job_id: 'ctxjob_42',
        status: 'queued',
        deduplicated: false,
      },
    });

    const out = await inv.cortex.jobs.create({
      project_id: 'proj_123',
      job_kind: 'counterfactual_eval',
      target_type: 'case',
      target_ref: 'case_123',
      question: 'What if Alice handled the escalation earlier?',
      criteria: {
        optimize_for: ['resolution_time', 'customer_satisfaction'],
        constraints: ['do_not_expose_private_evidence'],
      },
      input_refs: { run_ids: ['run_1'], case_ids: ['case_123'] },
      input_payload: {},
      options: { use_llm: true, create_surface_item: false },
    });

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/cortex/jobs' });
    const body = calls[0].body as Record<string, unknown>;
    expect(body.project_id).toBe('proj_123');
    expect(body.job_kind).toBe('counterfactual_eval');
    expect(body.target_type).toBe('case');
    expect(body.target_ref).toBe('case_123');
    expect(body.question).toBe('What if Alice handled the escalation earlier?');
    expect(body.criteria).toEqual({
      optimize_for: ['resolution_time', 'customer_satisfaction'],
      constraints: ['do_not_expose_private_evidence'],
    });
    expect(body.options).toEqual({ use_llm: true, create_surface_item: false });
    expect(out.job_id).toBe('ctxjob_42');
    expect(out.status).toBe('queued');
  });

  it('supports external targets with a payload', async () => {
    const { inv, calls } = stubbed();
    await inv.cortex.jobs.create({
      project_id: 'proj_1',
      job_kind: 'workflow_eval',
      target_type: 'external',
      target_ref: 'customer-sys-1',
      input_payload: { workflow_name: 'refund approval', steps: [] },
    });
    const body = calls[0].body as Record<string, unknown>;
    expect(body.target_type).toBe('external');
    expect(body.input_payload).toEqual({ workflow_name: 'refund approval', steps: [] });
  });
});

describe('CortexJobsResource.get', () => {
  it('GETs /v1/cortex/jobs/:id and url-encodes the id', async () => {
    const { inv, calls } = stubbed({
      'GET /v1/cortex/jobs/ctxjob_abc': {
        job: {
          id: 'ctxjob_abc',
          status: 'running',
          job_kind: 'workflow_eval',
        },
      },
    });
    const out = await inv.cortex.jobs.get('ctxjob_abc');
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/cortex/jobs/ctxjob_abc' });
    expect(out.status).toBe('running');
  });
});

describe('CortexJobsResource.result', () => {
  it('parses a workflow_eval result', async () => {
    const wf: WorkflowEvalResult = {
      kind: 'workflow_eval',
      passed: true,
      score: 0.82,
      criteria_results: [
        { criterion: 'sla_met', passed: true, evidence_refs: ['case_123'] },
      ],
      findings: [],
      confidence: 0.8,
    };
    const { inv } = stubbed({
      'GET /v1/cortex/jobs/ctxjob_1/result': {
        job_id: 'ctxjob_1',
        status: 'succeeded',
        result: wf,
      } satisfies CortexJobResult,
    });
    const out = await inv.cortex.jobs.result('ctxjob_1');
    expect(out.status).toBe('succeeded');
    expect(out.result?.kind).toBe('workflow_eval');
    if (out.result?.kind === 'workflow_eval') {
      expect(out.result.passed).toBe(true);
      expect(out.result.criteria_results[0].criterion).toBe('sla_met');
    }
  });

  it('parses a counterfactual_eval result with assumptions and uncertainty', async () => {
    const cf: CounterfactualEvalResult = {
      kind: 'counterfactual_eval',
      answer: 'Routing to Alice likely would have reduced delay by 1-2 days.',
      observed_outcome: 'Escalation resolved after 4 days.',
      hypothetical_change: 'Alice assigned at first escalation.',
      estimated_impact: { resolution_time_delta: '-1.5 days' },
      assumptions: ['Alice had bandwidth'],
      evidence_refs: ['case_123', 'run_1'],
      confidence: 0.64,
      uncertainty: 'Low sample size: 3 similar cases.',
    };
    const { inv } = stubbed({
      'GET /v1/cortex/jobs/ctxjob_1/result': {
        job_id: 'ctxjob_1',
        status: 'succeeded',
        result: cf,
      } satisfies CortexJobResult,
    });
    const out = await inv.cortex.jobs.result('ctxjob_1');
    if (out.result?.kind === 'counterfactual_eval') {
      expect(out.result.assumptions).toEqual(['Alice had bandwidth']);
      expect(out.result.uncertainty).toContain('Low sample size');
      expect(out.result.confidence).toBeCloseTo(0.64);
    } else {
      throw new Error('expected counterfactual_eval result');
    }
  });

  it('returns no result while still running', async () => {
    const { inv } = stubbed({
      'GET /v1/cortex/jobs/ctxjob_1/result': { job_id: 'ctxjob_1', status: 'running' },
    });
    const out = await inv.cortex.jobs.result('ctxjob_1');
    expect(out.status).toBe('running');
    expect(out.result).toBeUndefined();
  });
});
