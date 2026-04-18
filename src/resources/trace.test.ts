import { describe, it, expect } from 'vitest';
import { Invariance, trace } from '../index.js';
import { HttpClient } from '../client.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
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
    if (method === 'PATCH') {
      return { run: { id: 'run_1', status: 'completed', metadata: {}, agent_id: 'a_1', name: 't', created_at: '', updated_at: '', closed_at: null } };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  (http as unknown as { patch: unknown }).patch = (p: string, b?: unknown) => record('PATCH', p, b);
  return { inv, calls };
}

describe('trace()', () => {
  it('wraps an async fn and captures args + return by default', async () => {
    const { inv, calls } = stubbed();
    await inv.runs.start({ name: 't' }, async (run) => {
      const lookup = trace(run, 'lookup', async (id: string) => ({ id, ok: true }));
      const res = await lookup('o_1');
      expect(res).toEqual({ id: 'o_1', ok: true });
    });

    const nodePosts = calls.filter((c) => c.method === 'POST' && c.path === '/v1/nodes');
    const body = nodePosts.at(-1)!.body as Array<Record<string, unknown>>;
    const traced = body.find((n) => n.action_type === 'lookup')!;
    expect(traced.input).toEqual(['o_1']);
    expect(traced.output).toEqual({ id: 'o_1', ok: true });
  });

  it('nested traces link via parent_id', async () => {
    const { inv, calls } = stubbed();
    await inv.runs.start({ name: 't' }, async (run) => {
      const inner = trace(run, 'inner', async () => 1);
      const outer = trace(run, 'outer', async () => {
        await inner();
        return 2;
      });
      await outer();
    });

    const allNodes = calls
      .filter((c) => c.method === 'POST' && c.path === '/v1/nodes')
      .flatMap((c) => c.body as Array<Record<string, unknown>>);
    const outer = allNodes.find((n) => n.action_type === 'outer');
    const inner = allNodes.find((n) => n.action_type === 'inner');
    expect(inner?.parent_id).toBe(outer?.id);
  });

  it('captureArgs=false omits input', async () => {
    const { inv, calls } = stubbed();
    await inv.runs.start({ name: 't' }, async (run) => {
      const fn = trace(run, 'lookup', async (x: number) => x + 1, { captureArgs: false });
      await fn(5);
    });
    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => c.body as Array<Record<string, unknown>>);
    const traced = nodes.find((n) => n.action_type === 'lookup')!;
    expect(traced.input).toBeUndefined();
  });
});
