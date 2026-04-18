import { describe, it, expect, beforeEach } from 'vitest';
import { Invariance, trace } from '../index.js';
import { HttpClient } from '../client.js';

/**
 * These tests stub HttpClient's private fetch via method replacement so
 * we can assert exactly which requests the ergonomic surface emits.
 */

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbedInvariance(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });

  // Reach into the private HttpClient and override its methods.
  const http = (inv as unknown as { runs: { http: HttpClient } }).runs.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/runs') {
      return { run: { id: 'run_1', agent_id: 'a_1', name: 't', status: 'open', metadata: {}, created_at: '', updated_at: '', closed_at: null } };
    }
    if (method === 'POST' && path === '/v1/nodes') {
      const items = Array.isArray(body) ? body : [body];
      const data = items.map((item, i) => ({ ...(item as object), hash: `h_${i}` }));
      return { data };
    }
    if (method === 'PATCH' && path.startsWith('/v1/runs/')) {
      return { run: { id: 'run_1', agent_id: 'a_1', name: 't', status: 'completed', metadata: {}, created_at: '', updated_at: '', closed_at: null } };
    }
    return {};
  };

  http.get = ((path: string) => record('GET', path)) as HttpClient['get'];
  http.post = ((path: string, body?: unknown) => record('POST', path, body)) as HttpClient['post'];
  http.patch = ((path: string, body?: unknown) => record('PATCH', path, body)) as HttpClient['patch'];

  return { inv, calls };
}

describe('RunsResource.start (callback form)', () => {
  let inv: Invariance;
  let calls: Call[];
  beforeEach(() => {
    ({ inv, calls } = stubbedInvariance());
  });

  it('creates a run and auto-finishes on success', async () => {
    await inv.runs.start({ name: 'demo' }, async (run) => {
      expect(run.runId).toBe('run_1');
    });

    const paths = calls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toContain('POST /v1/runs');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect((patch?.body as { status?: string }).status).toBe('completed');
  });

  it('marks the run failed when the callback throws', async () => {
    await expect(
      inv.runs.start({}, async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');

    const patch = calls.find((c) => c.method === 'PATCH');
    expect((patch?.body as { status?: string }).status).toBe('failed');
  });

  it('emits a node per step with parent_id linkage for nested steps', async () => {
    let outerId = '';
    let innerId = '';
    await inv.runs.start({}, async (run) => {
      await run.step('outer', {}, async (outer) => {
        outerId = outer.id;
        await run.step('inner', {}, async (inner) => {
          innerId = inner.id;
        });
      });
    });

    const nodePosts = calls.filter((c) => c.path === '/v1/nodes');
    // All nodes flushed in one batch on run close.
    expect(nodePosts.length).toBeGreaterThanOrEqual(1);
    const nodes = nodePosts.flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(nodes.map((n) => [n.id as string, n]));
    expect(byId[outerId].parent_id).toBeUndefined();
    expect(byId[innerId].parent_id).toBe(outerId);
  });

  it('captures errors from within a step body', async () => {
    await expect(
      inv.runs.start({}, async (run) => {
        await run.step('boom', {}, async () => {
          throw new Error('bang');
        });
      }),
    ).rejects.toThrow('bang');

    const nodePosts = calls.filter((c) => c.path === '/v1/nodes');
    const nodes = nodePosts.flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const err = nodes[0].error as { type: string; message: string };
    expect(err.type).toBe('Error');
    expect(err.message).toBe('bang');
  });
});

describe('trace helper', () => {
  it('wraps a function and captures args + return', async () => {
    const { inv, calls } = stubbedInvariance();

    await inv.runs.start({}, async (run) => {
      const lookup = trace(run, 'lookup', async (x: number, y: number) => x + y);
      const result = await lookup(3, 4);
      expect(result).toBe(7);
    });

    const nodePosts = calls.filter((c) => c.path === '/v1/nodes');
    const nodes = nodePosts.flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    expect(nodes[0].action_type).toBe('lookup');
    expect(nodes[0].input).toEqual([3, 4]);
    expect(nodes[0].output).toBe(7);
  });
});

describe('unbuffered mode', () => {
  it('POSTs per step rather than on close', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({ buffered: false }, async (run) => {
      await run.step('a', {}, async () => {});
      await run.step('b', {}, async () => {});
    });
    const nodePosts = calls.filter((c) => c.path === '/v1/nodes');
    expect(nodePosts.length).toBe(2);
  });
});
