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
