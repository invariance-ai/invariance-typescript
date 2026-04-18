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
  // Patch the shared HttpClient via any resource (they share the same instance).
  const http = (inv as unknown as { proofs: { http: HttpClient } }).proofs.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (path === '/v1/runs/run_1/verify') {
      return { run_id: 'run_1', valid: true, node_count: 2, head_hash: 'h', first_invalid_node_id: null, reason: null };
    }
    if (path.startsWith('/v1/findings/') && method === 'PATCH') {
      return { finding: { id: 'f_1', status: 'resolved' } };
    }
    if (path.startsWith('/v1/reviews/') && method === 'PATCH') {
      return { review: { id: 'rv_1' }, finding: { id: 'f_1' } };
    }
    if (path.startsWith('/v1/findings') || path.startsWith('/v1/reviews')) {
      return { data: [], next_cursor: null };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  (http as unknown as { request: unknown }).request = (m: string, p: string, b?: unknown) => record(m, p, b);
  return { inv, calls };
}

describe('ProofsResource', () => {
  it('verifyRun hits /v1/runs/:id/verify', async () => {
    const { inv, calls } = stubbed();
    const res = await inv.proofs.verifyRun('run_1');
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/runs/run_1/verify', body: undefined });
    expect(res.valid).toBe(true);
  });
});

describe('FindingsResource', () => {
  it('list forwards pagination params', async () => {
    const { inv, calls } = stubbed();
    await inv.findings.list({ limit: 5, cursor: 'c_1' });
    expect(calls[0].path).toBe('/v1/findings?cursor=c_1&limit=5');
  });

  it('update PATCHes status', async () => {
    const { inv, calls } = stubbed();
    await inv.findings.update('f_1', { status: 'resolved' });
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/v1/findings/f_1',
      body: { status: 'resolved' },
    });
  });
});

describe('ReviewsResource', () => {
  it('claim and resolve send the right PATCH bodies', async () => {
    const { inv, calls } = stubbed();
    await inv.reviews.claim('rv_1', { notes: 'mine' });
    await inv.reviews.resolve('rv_1', { decision: 'passed', notes: 'ok' });
    expect(calls[0].body).toEqual({ status: 'claimed', notes: 'mine' });
    expect(calls[1].body).toEqual({ decision: 'passed', notes: 'ok' });
  });
});
