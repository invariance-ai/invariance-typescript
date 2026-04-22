import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient, InvarianceApiError, RateLimitError } from './client.js';

describe('InvarianceApiError', () => {
  it('stores status, code, and message', () => {
    const err = new InvarianceApiError(403, 'forbidden', 'Access denied');
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('Access denied');
    expect(err.name).toBe('InvarianceApiError');
  });
});

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn: FetchFn = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error('fetch: no response queued');
    return next();
  };
  (globalThis as unknown as { fetch: FetchFn }).fetch = fn;
  return calls;
}

describe('HttpClient retry', () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as unknown as { fetch: unknown }).fetch = origFetch;
  });

  it('retries on 429 then succeeds', async () => {
    const calls = stubFetch([
      () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'x' } }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      }),
      () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    const c = new HttpClient('http://x', 'k', {
      retryPolicy: { maxRetries: 2, baseSeconds: 0, jitter: 0 },
    });
    const result = await c.get<{ ok: boolean }>('/thing');
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('throws RateLimitError after retries exhausted', async () => {
    stubFetch([
      () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'nope' } }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      }),
      () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'nope' } }), {
        status: 429,
        headers: { 'Retry-After': '0' },
      }),
    ]);
    const c = new HttpClient('http://x', 'k', {
      retryPolicy: { maxRetries: 1, baseSeconds: 0, jitter: 0 },
    });
    await expect(c.get('/thing')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('does not retry on 400', async () => {
    const calls = stubFetch([
      () => new Response(JSON.stringify({ error: { code: 'bad_request', message: 'no' } }), {
        status: 400,
      }),
    ]);
    const c = new HttpClient('http://x', 'k', {
      retryPolicy: { maxRetries: 3, baseSeconds: 0, jitter: 0 },
    });
    await expect(c.get('/thing')).rejects.toBeInstanceOf(InvarianceApiError);
    expect(calls).toHaveLength(1);
  });

  it('retries on 5xx', async () => {
    const calls = stubFetch([
      () => new Response('{}', { status: 503 }),
      () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    ]);
    const c = new HttpClient('http://x', 'k', {
      retryPolicy: { maxRetries: 2, baseSeconds: 0, jitter: 0 },
    });
    const result = await c.get<{ ok: number }>('/thing');
    expect(result).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });
});
