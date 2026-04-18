import { describe, it, expect } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { nodes: { http: HttpClient } }).nodes.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/nodes') {
      const items = Array.isArray(body) ? body : [body];
      const data = items.map((item, i) => ({ ...(item as object), id: `n_${i}`, hash: `h_${i}` }));
      return { data };
    }
    if (method === 'GET' && path.startsWith('/v1/runs/')) {
      return { data: [{ id: 'n_0' }], next_cursor: null };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  return { inv, calls };
}

describe('NodesResource.write', () => {
  it('accepts a single event and posts a single-item array under run_id', async () => {
    const { inv, calls } = stubbed();
    const out = await inv.nodes.write('run_1', [
      { action_type: 'tool.use', type: 'lookup', input: { x: 1 } },
    ]);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/nodes' });
    const body = calls[0].body as Array<Record<string, unknown>>;
    expect(body[0].run_id).toBe('run_1');
    expect(body[0].type).toBe('lookup');
    expect(out[0].hash).toBe('h_0');
  });

  it('batches multiple events under the same run_id', async () => {
    const { inv, calls } = stubbed();
    await inv.nodes.write('run_2', [
      { action_type: 'a' },
      { action_type: 'b', type: 'lookup' },
    ]);
    const body = calls[0].body as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body.every((b) => b.run_id === 'run_2')).toBe(true);
  });

  it('list passes cursor and limit', async () => {
    const { inv, calls } = stubbed();
    await inv.nodes.list('run_3', { cursor: 'c_1', limit: 10 });
    expect(calls[0].path).toBe('/v1/runs/run_3/nodes?cursor=c_1&limit=10');
  });
});
