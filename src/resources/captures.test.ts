import { describe, it, expect } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';
import type { Capture } from './captures.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { captures: { http: HttpClient } }).captures.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });

    if (method === 'POST' && path === '/v1/captures') {
      const b = body as { source: string; session_type?: string; title?: string };
      return {
        session: {
          id: 'cap_1',
          source: b.source,
          session_type: b.session_type ?? null,
          title: b.title ?? null,
          status: 'open',
          run_id: null,
        },
      };
    }
    if (method === 'GET' && path === '/v1/captures/cap_1') {
      return { session: { id: 'cap_1', source: 'api', run_id: 'run_abc' } };
    }
    if (method === 'GET' && path.startsWith('/v1/captures')) {
      return { data: [], next_cursor: null };
    }
    if (method === 'PATCH' && path === '/v1/captures/cap_1') {
      const b = body as Record<string, unknown>;
      return {
        session: { id: 'cap_1', source: 'api', run_id: b.run_id ?? null, ...b },
      };
    }
    return {};
  };

  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  (http as unknown as { patch: unknown }).patch = (p: string, b?: unknown) => record('PATCH', p, b);

  return { inv, calls };
}

describe('CapturesResource', () => {
  it('create() POSTs to /v1/captures and unwraps session', async () => {
    const { inv, calls } = stubbed();
    const cap = await inv.captures.create({ source: 'api', session_type: 'coding', title: 'test' });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/captures',
      body: { source: 'api', session_type: 'coding', title: 'test' },
    });
    expect(cap.id).toBe('cap_1');
    expect(cap.source).toBe('api');
  });

  it('get() hits /v1/captures/:id and unwraps session', async () => {
    const { inv, calls } = stubbed();
    const cap = await inv.captures.get('cap_1');
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/captures/cap_1', body: undefined });
    expect(cap.id).toBe('cap_1');
  });

  it('list() forwards all filters including run_id', async () => {
    const { inv, calls } = stubbed();
    await inv.captures.list({
      project_id: 'p_1',
      operator_id: 'op_2',
      session_type: 'coding',
      source: 'claude_code',
      run_id: 'run_abc',
      limit: 10,
    });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe(
      '/v1/captures?project_id=p_1&operator_id=op_2&session_type=coding&source=claude_code&run_id=run_abc&limit=10',
    );
  });

  it('list() with only run_id filter builds correct query string', async () => {
    const { inv, calls } = stubbed();
    await inv.captures.list({ run_id: 'run_xyz' });
    expect(calls[0].path).toBe('/v1/captures?run_id=run_xyz');
  });

  it('update() PATCHes /v1/captures/:id and unwraps session', async () => {
    const { inv, calls } = stubbed();
    const cap = await inv.captures.update('cap_1', { status: 'closed' });
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/v1/captures/cap_1',
      body: { status: 'closed' },
    });
    expect(cap.id).toBe('cap_1');
  });

  it('link() PATCHes /v1/captures/:id with {run_id} and unwraps session', async () => {
    const { inv, calls } = stubbed();
    const cap = await inv.captures.link('cap_1', { run_id: 'run_abc' });
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/v1/captures/cap_1',
      body: { run_id: 'run_abc' },
    });
    expect((cap as Capture).run_id).toBe('run_abc');
  });

  it('unlink() PATCHes /v1/captures/:id with {run_id: null}', async () => {
    const { inv, calls } = stubbed();
    await inv.captures.unlink('cap_1');
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/v1/captures/cap_1',
      body: { run_id: null },
    });
  });

  it('listLinks() returns {run_id} from the capture', async () => {
    const { inv } = stubbed();
    const result = await inv.captures.listLinks('cap_1');
    expect(result).toEqual({ run_id: 'run_abc' });
  });

  it('listLinks() returns {run_id: null} when capture has no run_id', async () => {
    const { inv, calls } = stubbed();
    // Override GET to return no run_id
    const http = (inv as unknown as { captures: { http: HttpClient } }).captures.http;
    (http as unknown as { get: unknown }).get = async (p: string) => {
      calls.push({ method: 'GET', path: p, body: undefined });
      return { session: { id: 'cap_1', source: 'api' } };
    };
    const result = await inv.captures.listLinks('cap_1');
    expect(result).toEqual({ run_id: null });
  });
});
