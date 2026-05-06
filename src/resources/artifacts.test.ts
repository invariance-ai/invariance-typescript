import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';
import { sha256BytesHex } from '../crypto.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { artifacts: { http: HttpClient } }).artifacts.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/artifacts') {
      return {
        artifact_id: 'art_1',
        upload_url: 'http://upload.test/sig?token=xyz',
        expires_at: '2030-01-01T00:00:00Z',
      };
    }
    if (method === 'POST' && path.endsWith('/finalize')) {
      const b = body as { sha256: string; byte_size: number };
      return {
        artifact_id: 'art_1',
        sha256: b.sha256,
        kind: 'screenshot',
        mime: 'image/png',
        byte_size: b.byte_size,
        url: 'http://cdn.test/art_1.png',
      };
    }
    if (method === 'GET') {
      return { artifact_id: 'art_1', sha256: 'x', kind: 'screenshot', mime: 'image/png', byte_size: 1 };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  return { inv, calls };
}

describe('ArtifactsResource.upload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hashes bytes, posts init, PUTs, then finalizes', async () => {
    const { inv, calls } = stubbed();
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const expectedSha = sha256BytesHex(data);

    const ref = await inv.artifacts.upload({
      runId: 'run_1',
      kind: 'screenshot',
      mime: 'image/png',
      data,
    });

    expect(ref.artifact_id).toBe('art_1');
    expect(ref.sha256).toBe(expectedSha);
    expect(ref.byte_size).toBe(4);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/artifacts',
      body: {
        run_id: 'run_1',
        kind: 'screenshot',
        mime: 'image/png',
        sha256: expectedSha,
        byte_size: 4,
      },
    });
    expect(calls[1].path).toBe('/v1/artifacts/art_1/finalize');

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://upload.test/sig?token=xyz');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('throws when the presigned PUT fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 403, statusText: 'Forbidden' })),
    );
    const { inv } = stubbed();
    await expect(
      inv.artifacts.upload({
        runId: 'run_1',
        kind: 'screenshot',
        mime: 'image/png',
        data: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/PUT failed: 403/);
  });

  it('encodes a string body as UTF-8 before hashing', async () => {
    const { inv, calls } = stubbed();
    await inv.artifacts.upload({
      runId: 'run_1',
      kind: 'log',
      mime: 'text/plain',
      data: 'hello',
    });
    const expected = sha256BytesHex(new TextEncoder().encode('hello'));
    expect((calls[0].body as { sha256: string }).sha256).toBe(expected);
  });
});
