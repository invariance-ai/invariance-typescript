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

  it('reuses one Idempotency-Key across mutating retries', async () => {
    const calls = stubFetch([
      () => new Response('{}', { status: 503 }),
      () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    ]);
    const c = new HttpClient('http://x', 'k', {
      retryPolicy: { maxRetries: 2, baseSeconds: 0, jitter: 0 },
    });

    await c.post<{ ok: number }>('/thing', { title: 'x' });

    const first = (calls[0]?.init?.headers as Record<string, string>)['Idempotency-Key'];
    const second = (calls[1]?.init?.headers as Record<string, string>)['Idempotency-Key'];
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('passes the configured abort signal through fetch', async () => {
    const controller = new AbortController();
    const calls = stubFetch([() => new Response(JSON.stringify({ ok: true }), { status: 200 })]);
    const c = new HttpClient('http://x', 'k', {
      signal: controller.signal,
      retryPolicy: { maxRetries: 0, baseSeconds: 0, jitter: 0 },
    });

    await c.get('/thing');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });

  it('normalizes trailing slashes in baseUrl', async () => {
    const calls = stubFetch([
      () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    const c = new HttpClient('https://x.example.com/', 'k', {
      retryPolicy: { maxRetries: 0, baseSeconds: 0, jitter: 0 },
    });
    await c.get('/v1/foo');
    expect(calls[0]?.url).toBe('https://x.example.com/v1/foo');
  });

  it('normalizes multiple trailing slashes', async () => {
    const calls = stubFetch([
      () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ]);
    const c = new HttpClient('https://x.example.com///', 'k', {
      retryPolicy: { maxRetries: 0, baseSeconds: 0, jitter: 0 },
    });
    await c.get('/v1/foo');
    expect(calls[0]?.url).toBe('https://x.example.com/v1/foo');
  });
});
