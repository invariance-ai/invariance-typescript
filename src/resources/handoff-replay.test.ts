import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Invariance } from '../index.js';
import { priceCall } from '../providers/pricing.js';

type Recorded = { method: string; path: string; body?: unknown };

function installFetch(handler: (method: string, path: string, body: unknown) => Response): () => Recorded[] {
  const calls: Recorded[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(url as string).pathname;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });
    return handler(method, path, body);
  }) as typeof fetch;
  (installFetch as unknown as { _restore: () => void })._restore = () => {
    globalThis.fetch = original;
  };
  return () => calls;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('multi-agent handoff', () => {
  let getCalls: () => Recorded[];
  afterEach(() => {
    (installFetch as unknown as { _restore?: () => void })._restore?.();
  });

  beforeEach(() => {
    getCalls = installFetch((method, path, body) => {
      if (method === 'POST' && path === '/v1/runs') {
        return jsonResponse({
          run: { id: 'run_1', agent_id: 'a_1', name: (body as { name?: string })?.name ?? '', status: 'open' },
        });
      }
      if (method === 'POST' && path === '/v1/nodes') {
        const items = Array.isArray(body) ? body : [body];
        return jsonResponse({ data: items.map((i: Record<string, unknown>, idx) => ({ ...i, hash: `h_${idx}` })) });
      }
      if (method === 'POST' && path.endsWith('/fork')) {
        return jsonResponse({
          run: {
            id: 'run_fork',
            agent_id: 'a_1',
            name: 'forked',
            status: 'open',
            parent_run_id: 'run_1',
            fork_point_node_id: (body as { from_node_id: string }).from_node_id,
          },
        });
      }
      if (method === 'PATCH') return jsonResponse({ run: { id: 'run_1', status: 'completed' } });
      return new Response(null, { status: 404 });
    });
  });

  it('emits a handoff node with handoff_from/to/reason', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    const run = await inv.runs.start({ name: 'demo' });
    await run.handoff({ toAgentId: 'executor', reason: 'specialist', message: { task: 'x' } });
    await run.finish();

    const calls = getCalls();
    const nodePost = calls.find((c) => c.path === '/v1/nodes')!;
    const node = (nodePost.body as Record<string, unknown>[])[0];
    expect(node.action_type).toBe('handoff');
    expect(node.handoff_to).toBe('executor');
    expect(node.handoff_reason).toBe('specialist');
  });

  it('rejects replaySeed without feature flag', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    await expect(inv.runs.start({ replaySeed: 's1' })).rejects.toThrow(/INVARIANCE_FEATURE_REPLAY/);
  });

  it('rejects fork without feature flag', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    await expect(inv.runs.fork('run_1', { fromNodeId: 'n_1' })).rejects.toThrow(/INVARIANCE_FEATURE_REPLAY/);
  });

  it('forks a run when feature flag enabled', async () => {
    const inv = Invariance.init({
      apiKey: 'inv_test',
      apiUrl: 'http://test.local',
      features: { replay: true },
    });
    const forked = await inv.runs.fork('run_1', { fromNodeId: 'n_3' });
    expect(forked.runId).toBe('run_fork');
    const calls = getCalls();
    const forkPost = calls.find((c) => c.path.endsWith('/fork'))!;
    expect((forkPost.body as { from_node_id: string }).from_node_id).toBe('n_3');
  });
});

describe('pricing', () => {
  it('prices a known model', () => {
    const cost = priceCall({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeCloseTo(0.00045, 6);
  });

  it('prices an unknown model as 0', () => {
    expect(priceCall({ model: 'mystery-xyz', inputTokens: 1000, outputTokens: 500 })).toBe(0);
  });

  it('prefix-matches versioned aliases', () => {
    const cost = priceCall({ model: 'gpt-4o-2024-08-06', inputTokens: 1000, outputTokens: 0 });
    expect(cost).toBeCloseTo(0.0025, 6);
  });
});
