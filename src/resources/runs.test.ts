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

describe('run.log / run.context / run.tool helpers', () => {
  it('run.log emits a node with action_type=log and structured input', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({}, async (run) => {
      await run.log('decision context', { orderId: 'o_1', policy: 'refund-30d' });
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const log = nodes.find((n) => n.action_type === 'log')!;
    expect(log).toBeDefined();
    expect(log.input).toEqual({ message: 'decision context', data: { orderId: 'o_1', policy: 'refund-30d' } });
  });

  it('run.log without data still emits the message', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({}, async (run) => {
      await run.log('plain breadcrumb');
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const log = nodes.find((n) => n.action_type === 'log')!;
    expect(log.input).toEqual({ message: 'plain breadcrumb' });
  });

  it('run.context preserves structured data as input', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({}, async (run) => {
      await run.context({ userId: 'u_1', riskTier: 'medium' });
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const ctx = nodes.find((n) => n.action_type === 'context')!;
    expect(ctx.input).toEqual({ userId: 'u_1', riskTier: 'medium' });
  });

  it('run.tool callback form captures output and duration', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({}, async (run) => {
      const out = await run.tool('policy_lookup', { orderId: 'o_1' }, async () => {
        return { policy: 'refund-30d' };
      });
      expect(out).toEqual({ policy: 'refund-30d' });
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const tool = nodes.find((n) => n.action_type === 'tool_call')!;
    expect(tool.type).toBe('tool_call');
    expect(tool.input).toEqual({ orderId: 'o_1' });
    expect(tool.output).toEqual({ policy: 'refund-30d' });
    expect(typeof tool.duration_ms).toBe('number');
    const cf = tool.custom_fields as Record<string, unknown>;
    expect(cf.tool_name).toBe('policy_lookup');
    expect(cf.status).toBe('success');
    expect(cf.tool_output).toEqual({ policy: 'refund-30d' });
  });

  it('run.tool callback form captures thrown error and still closes the node', async () => {
    const { inv, calls } = stubbedInvariance();
    await expect(
      inv.runs.start({}, async (run) => {
        await run.tool('policy_lookup', { orderId: 'o_1' }, async () => {
          throw new Error('lookup failed');
        });
      }),
    ).rejects.toThrow('lookup failed');

    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const tool = nodes.find((n) => n.action_type === 'tool_call')!;
    expect(tool).toBeDefined();
    const err = tool.error as { type: string; message: string };
    expect(err.message).toBe('lookup failed');
    const cf = tool.custom_fields as Record<string, unknown>;
    expect(cf.status).toBe('error');
  });

  it('run.tool direct form records explicit output', async () => {
    const { inv, calls } = stubbedInvariance();
    await inv.runs.start({}, async (run) => {
      await run.tool('policy_lookup', { orderId: 'o_1' }, { output: { policy: 'refund-30d' } });
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const tool = nodes.find((n) => n.action_type === 'tool_call')!;
    expect(tool.output).toEqual({ policy: 'refund-30d' });
    const cf = tool.custom_fields as Record<string, unknown>;
    expect(cf.status).toBe('success');
    expect(cf.tool_output).toEqual({ policy: 'refund-30d' });
  });

  it('nested run.tool inside run.step preserves parent_id', async () => {
    const { inv, calls } = stubbedInvariance();
    let outerId = '';
    await inv.runs.start({}, async (run) => {
      await run.step('outer', {}, async (outer) => {
        outerId = outer.id;
        await run.tool('inner_tool', { q: 1 }, async () => 'ok');
      });
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => (Array.isArray(c.body) ? c.body : [c.body])) as Array<Record<string, unknown>>;
    const tool = nodes.find((n) => n.action_type === 'tool_call')!;
    expect(tool.parent_id).toBe(outerId);
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
