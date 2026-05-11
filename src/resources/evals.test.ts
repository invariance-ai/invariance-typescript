import { describe, it, expect } from 'vitest';
import { HttpClient } from '../client.js';
import { Invariance } from '../index.js';
import { deriveStatus, readEvalMetadata } from './evals.js';
import type { Finding } from './findings.js';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

interface StubOptions {
  findings?: Finding[];
  runsList?: { data: unknown[]; next_cursor: string | null };
}

function stubInvariance(opts: StubOptions = {}): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });

  const handle = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });

    if (method === 'POST' && path === '/v1/runs') {
      return {
        run: {
          id: 'run_eval_1',
          agent_id: 'agent_1',
          name: (body as { name?: string }).name ?? '',
          status: 'open',
          metadata: (body as { metadata?: Record<string, unknown> }).metadata ?? {},
          created_at: '2026-05-06T00:00:00Z',
          updated_at: '2026-05-06T00:00:00Z',
          closed_at: null,
        },
      };
    }
    if (method === 'POST' && path === '/v1/nodes') {
      const items = Array.isArray(body) ? body : [body];
      return { data: items.map((item, i) => ({ ...(item as object), hash: `h_${i}` })) };
    }
    if (method === 'PATCH' && path.startsWith('/v1/runs/')) {
      return {
        run: {
          id: 'run_eval_1',
          agent_id: 'agent_1',
          name: '',
          status: 'completed',
          metadata: {},
          created_at: '2026-05-06T00:00:00Z',
          updated_at: '2026-05-06T00:00:00Z',
          closed_at: '2026-05-06T00:00:01Z',
        },
      };
    }
    if (method === 'POST' && path.includes('/evaluate')) {
      return { execution: { id: 'exec_1' }, signals: [], findings: [], reviews: [] };
    }
    if (method === 'GET' && path.startsWith('/v1/findings')) {
      return { data: opts.findings ?? [], next_cursor: null };
    }
    if (method === 'GET' && path.startsWith('/v1/runs')) {
      return opts.runsList ?? { data: [], next_cursor: null };
    }
    return {};
  };

  for (const key of ['runs', 'nodes', 'signals', 'findings', 'monitors'] as const) {
    const http = (inv as unknown as Record<string, { http: HttpClient }>)[key]
      .http as unknown as HttpClient;
    http.get = ((path: string) => handle('GET', path)) as HttpClient['get'];
    http.post = ((path: string, body?: unknown) => handle('POST', path, body)) as HttpClient['post'];
    http.patch = ((path: string, body?: unknown) =>
      handle('PATCH', path, body)) as HttpClient['patch'];
  }
  // EvalsResource owns its own http reference + nested resources — stub them too.
  const evals = (inv as unknown as { evals: Record<string, { http: HttpClient } | HttpClient> })
    .evals;
  for (const k of Object.keys(evals)) {
    const v = (evals as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && 'get' in v) {
      const h = v as HttpClient;
      h.get = ((path: string) => handle('GET', path)) as HttpClient['get'];
      h.post = ((path: string, body?: unknown) => handle('POST', path, body)) as HttpClient['post'];
      h.patch = ((path: string, body?: unknown) =>
        handle('PATCH', path, body)) as HttpClient['patch'];
    } else if (v && typeof v === 'object' && 'http' in (v as object)) {
      const h = (v as { http: HttpClient }).http;
      h.get = ((path: string) => handle('GET', path)) as HttpClient['get'];
      h.post = ((path: string, body?: unknown) => handle('POST', path, body)) as HttpClient['post'];
      h.patch = ((path: string, body?: unknown) =>
        handle('PATCH', path, body)) as HttpClient['patch'];
    }
  }

  return { inv, calls };
}

describe('readEvalMetadata', () => {
  it('returns null when metadata.eval missing', () => {
    expect(readEvalMetadata({ metadata: {} })).toBeNull();
  });

  it('returns null when suite/case missing', () => {
    expect(readEvalMetadata({ metadata: { eval: { suite: 'a' } } })).toBeNull();
  });

  it('parses suite + case + optional fields', () => {
    const meta = readEvalMetadata({
      metadata: { eval: { suite: 's', case: 'c', tags: ['x'], expected: 1 } },
    });
    expect(meta).toEqual({ suite: 's', case: 'c', expected: 1, inputs: undefined, tags: ['x'] });
  });
});

describe('deriveStatus', () => {
  const f = (sev: Finding['severity'], status: Finding['status'] = 'open'): Finding => ({
    id: 'f',
    agent_id: 'a',
    monitor_id: 'm',
    signal_id: 's',
    run_id: 'r',
    node_id: null,
    severity: sev,
    title: '',
    summary: '',
    status,
    created_at: '',
    updated_at: '',
  });

  it('passes with no findings', () => {
    expect(deriveStatus([])).toBe('pass');
  });

  it('passes with only low/info severity', () => {
    expect(deriveStatus([f('info'), f('low')])).toBe('pass');
  });

  it('fails when an open finding meets medium threshold', () => {
    expect(deriveStatus([f('medium')])).toBe('fail');
  });

  it('passes when a high-severity finding is resolved', () => {
    expect(deriveStatus([f('high', 'resolved')])).toBe('pass');
  });
});

describe('EvalsResource.runCase', () => {
  it('stamps metadata.eval, runs handler, and returns pass when no findings', async () => {
    const { inv, calls } = stubInvariance();
    let handlerRan = false;
    const result = await inv.evals.runCase({
      suite: 'regression-v1',
      case: 'happy-path',
      handler: async () => {
        handlerRan = true;
      },
    });
    expect(handlerRan).toBe(true);
    expect(result.status).toBe('pass');
    expect(result.suite).toBe('regression-v1');
    expect(result.case).toBe('happy-path');

    const startCall = calls.find((c) => c.method === 'POST' && c.path === '/v1/runs');
    expect(startCall).toBeDefined();
    const body = startCall!.body as { metadata: { eval: { suite: string; case: string } } };
    expect(body.metadata.eval.suite).toBe('regression-v1');
    expect(body.metadata.eval.case).toBe('happy-path');
  });

  it('fails when a medium finding exists', async () => {
    const finding: Finding = {
      id: 'f1',
      agent_id: 'a',
      monitor_id: 'm',
      signal_id: 's',
      run_id: 'run_eval_1',
      node_id: null,
      severity: 'medium',
      title: 'fail',
      summary: '',
      status: 'open',
      created_at: '',
      updated_at: '',
    };
    const { inv } = stubInvariance({ findings: [finding] });
    const result = await inv.evals.runCase({
      suite: 's',
      case: 'c',
      handler: async () => {},
    });
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
  });

  it('evaluates monitors after the handler', async () => {
    const { inv, calls } = stubInvariance();
    await inv.evals.runCase({
      suite: 's',
      case: 'c',
      monitorIds: ['mon_1', 'mon_2'],
      handler: async () => {},
    });
    const evalCalls = calls.filter((c) => c.path.includes('/evaluate'));
    expect(evalCalls).toHaveLength(2);
    expect(evalCalls[0].path).toBe('/v1/monitors/mon_1/evaluate');
    expect(evalCalls[1].path).toBe('/v1/monitors/mon_2/evaluate');
  });
});

describe('EvalsResource.listCases', () => {
  it('queries /v1/runs?eval_suite= and maps records', async () => {
    const { inv, calls } = stubInvariance({
      runsList: {
        data: [
          {
            id: 'r1',
            agent_id: 'a',
            name: '',
            status: 'completed',
            metadata: { eval: { suite: 's', case: 'c1' } },
            created_at: '2026-05-06T00:00:00Z',
            updated_at: '',
            closed_at: null,
          },
          {
            id: 'r2',
            agent_id: 'a',
            name: '',
            status: 'completed',
            metadata: {}, // no eval — should be filtered
            created_at: '2026-05-06T00:00:00Z',
            updated_at: '',
            closed_at: null,
          },
        ],
        next_cursor: null,
      },
    });
    const res = await inv.evals.listCases({ suite: 's' });
    expect(res.suite).toBe('s');
    expect(res.runs).toHaveLength(1);
    expect(res.runs[0].case).toBe('c1');
    expect(res.runs[0].status).toBe('pass');
    expect(calls.some((c) => c.method === 'GET' && c.path.includes('eval_suite=s'))).toBe(true);
  });
});

describe('EvalsResource nested namespaces', () => {
  function stubEvalsHttp(): {
    inv: Invariance;
    calls: Call[];
    setResponse: (matcher: (m: string, p: string) => boolean, value: unknown) => void;
  } {
    const calls: Call[] = [];
    const responses: Array<{ match: (m: string, p: string) => boolean; value: unknown }> = [];
    const setResponse = (matcher: (m: string, p: string) => boolean, value: unknown): void => {
      responses.unshift({ match: matcher, value });
    };
    const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
    const handle = async (method: string, path: string, body?: unknown): Promise<unknown> => {
      calls.push({ method, path, body });
      for (const r of responses) {
        if (r.match(method, path)) return r.value;
      }
      return {};
    };
    const evals = (inv as unknown as { evals: Record<string, unknown> }).evals;
    for (const k of Object.keys(evals)) {
      const v = (evals as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'http' in (v as object)) {
        const h = (v as { http: HttpClient }).http;
        h.get = ((p: string) => handle('GET', p)) as HttpClient['get'];
        h.post = ((p: string, b?: unknown) => handle('POST', p, b)) as HttpClient['post'];
      }
    }
    return { inv, calls, setResponse };
  }

  it('datasets.list hits /v1/eval-datasets with paging', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'GET' && p.startsWith('/v1/eval-datasets'),
      { data: [], next_cursor: null },
    );
    await inv.evals.datasets.list({ limit: 25 });
    const c = calls.find((c) => c.method === 'GET' && c.path.startsWith('/v1/eval-datasets'));
    expect(c?.path).toContain('limit=25');
  });

  it('datasets.create unwraps { dataset }', async () => {
    const { inv, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'POST' && p === '/v1/eval-datasets',
      {
        dataset: {
          id: 'd1',
          agent_id: 'a',
          name: 'd',
          description: '',
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      },
    );
    const ds = await inv.evals.datasets.create({ name: 'd' });
    expect(ds.id).toBe('d1');
  });

  it('datasets.appendRows posts examples and unwraps each', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    let i = 0;
    setResponse(
      (m, p) => m === 'POST' && p === '/v1/eval-datasets/d1/examples',
      undefined as never,
    );
    const evals = (inv as unknown as { evals: Record<string, unknown> }).evals;
    const dsResource = (evals as { datasets: { http: HttpClient } }).datasets;
    dsResource.http.post = (async (p: string, b: unknown) => {
      calls.push({ method: 'POST', path: p, body: b });
      i++;
      return {
        example: {
          id: `ex_${i}`,
          dataset_id: 'd1',
          agent_id: 'a',
          input: {},
          expected: {},
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      };
    }) as HttpClient['post'];
    const rows = await inv.evals.datasets.appendRows('d1', [
      { input: { q: 1 } },
      { input: { q: 2 } },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['ex_1', 'ex_2']);
    expect(calls.filter((c) => c.path === '/v1/eval-datasets/d1/examples')).toHaveLength(2);
  });

  it('scorers.list hits /v1/eval-scorers', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'GET' && p.startsWith('/v1/eval-scorers'),
      { data: [], next_cursor: null },
    );
    await inv.evals.scorers.list();
    expect(calls.some((c) => c.method === 'GET' && c.path.startsWith('/v1/eval-scorers'))).toBe(
      true,
    );
  });

  it('suites.get unwraps { suite }', async () => {
    const { inv, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'GET' && p === '/v1/eval-suites/s1',
      {
        suite: {
          id: 's1',
          agent_id: 'a',
          dataset_id: null,
          name: 's',
          description: '',
          target_type: 'custom',
          scorer_ids: [],
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      },
    );
    const s = await inv.evals.suites.get('s1');
    expect(s.id).toBe('s1');
  });

  it('cases.create posts to suite cases path', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'POST' && p === '/v1/eval-suites/s1/cases',
      {
        case: {
          id: 'c1',
          suite_id: 's1',
          agent_id: 'a',
          dataset_example_id: null,
          source_run_id: null,
          source_finding_id: null,
          source_graph_ref: null,
          name: 'n',
          input_bundle: {},
          mutations: [],
          expected: {},
          assertions: [],
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      },
    );
    const c = await inv.evals.cases.create('s1', { name: 'n' });
    expect(c.id).toBe('c1');
    expect(calls.some((cc) => cc.path === '/v1/eval-suites/s1/cases' && cc.method === 'POST')).toBe(
      true,
    );
  });

  it('runs.start unwraps { eval_run }', async () => {
    const { inv, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'POST' && p === '/v1/eval-suites/s1/run',
      {
        eval_run: {
          id: 'er1',
          suite_id: 's1',
          agent_id: 'a',
          target_type: 'custom',
          target_ref: null,
          status: 'queued',
          summary: {},
          started_at: null,
          completed_at: null,
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      },
    );
    const r = await inv.evals.runs.start('s1');
    expect(r.id).toBe('er1');
    expect(r.status).toBe('queued');
  });

  it('runs.listResults hits results path', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'GET' && p.startsWith('/v1/eval-runs/er1/results'),
      { data: [], next_cursor: null },
    );
    await inv.evals.runs.listResults('er1', { limit: 10 });
    const c = calls.find((c) => c.path.startsWith('/v1/eval-runs/er1/results'));
    expect(c?.path).toContain('limit=10');
  });

  it('experiments.run posts scorers to /v1/eval-runs/:id/experiment', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'POST' && p === '/v1/eval-runs/er1/experiment',
      {
        eval_run: {
          id: 'er1',
          suite_id: 's1',
          agent_id: 'a',
          target_type: 'custom',
          target_ref: null,
          status: 'running',
          summary: {},
          started_at: '',
          completed_at: null,
          metadata: {},
          created_at: '',
          updated_at: '',
        },
      },
    );
    const r = await inv.evals.experiments.run('er1', {
      scorers: [{ name: 'exact_match' }, { name: 'numeric_tolerance', config: { tolerance: 0.1 } }],
    });
    expect(r.status).toBe('running');
    const call = calls.find((c) => c.path === '/v1/eval-runs/er1/experiment');
    expect((call?.body as { scorers: unknown[] }).scorers).toHaveLength(2);
  });

  it('experiments.compare encodes baseline query param', async () => {
    const { inv, calls, setResponse } = stubEvalsHttp();
    setResponse(
      (m, p) => m === 'GET' && p.startsWith('/v1/eval-runs/erB/compare'),
      {
        baseline_run_id: 'erA',
        current_run_id: 'erB',
        aggregate: {},
        cases: [],
      },
    );
    const cmp = await inv.evals.experiments.compare('erB', 'erA');
    expect(cmp.baseline_run_id).toBe('erA');
    const c = calls.find((c) => c.path.startsWith('/v1/eval-runs/erB/compare'));
    expect(c?.path).toContain('baseline=erA');
  });
});
