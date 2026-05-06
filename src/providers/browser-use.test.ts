import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';
import { instrumentBrowserUse, type BrowserUseLike } from './browser-use.js';

interface PostedNode {
  action_type: string;
  type?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  run_id?: string;
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

async function setup(): Promise<{
  inv: Invariance;
  run: Awaited<ReturnType<Invariance['runs']['start']>>;
  posted: PostedNode[];
  calls: Call[];
}> {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { runs: { http: HttpClient } }).runs.http;

  let nodeCounter = 0;
  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/runs') {
      return {
        run: {
          id: 'run_1',
          agent_id: 'a_1',
          name: 'test',
          status: 'open',
          metadata: {},
          created_at: '',
          updated_at: '',
          closed_at: null,
        },
      };
    }
    if (method === 'POST' && path === '/v1/nodes') {
      const items = Array.isArray(body) ? body : [body];
      const data = items.map((item) => ({ ...(item as object), id: `n_${nodeCounter++}`, hash: `h_${nodeCounter}` }));
      return { data };
    }
    if (method === 'POST' && path === '/v1/artifacts') {
      return { artifact_id: 'art_1', upload_url: 'http://upload.test', expires_at: '' };
    }
    if (method === 'POST' && path.endsWith('/finalize')) {
      const b = body as { sha256: string; byte_size: number };
      return { artifact_id: 'art_1', sha256: b.sha256, kind: 'screenshot', mime: 'image/png', byte_size: b.byte_size };
    }
    if (method === 'PATCH') return { id: 'run_1', status: 'completed' };
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  (http as unknown as { patch: unknown }).patch = (p: string, b?: unknown) => record('PATCH', p, b);

  const run = await inv.runs.start({ name: 'browser-test', buffered: false });
  const posted = (): PostedNode[] => {
    const out: PostedNode[] = [];
    for (const c of calls) {
      if (c.method === 'POST' && c.path === '/v1/nodes' && Array.isArray(c.body)) {
        out.push(...(c.body as PostedNode[]));
      }
    }
    return out;
  };
  return { inv, run, posted: posted(), calls };
}

describe('instrumentBrowserUse', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits a browser_action node per step with action + latency metadata', async () => {
    const { inv, run, calls } = await setup();

    const fakeAgent: BrowserUseLike = {
      step: vi.fn(async () => ({ action: 'click', target: '#submit', output: 'ok', done: false })),
    };
    const wrapped = instrumentBrowserUse(fakeAgent, run);

    await wrapped.step!();
    await wrapped.step!();
    await run.finish();

    const nodes = calls
      .filter((c) => c.method === 'POST' && c.path === '/v1/nodes')
      .flatMap((c) => c.body as PostedNode[]);
    const browserNodes = nodes.filter((n) => n.action_type === 'browser_action');
    expect(browserNodes).toHaveLength(2);
    expect(browserNodes[0].metadata?.browser).toMatchObject({ action: 'click', status: 'success' });
    expect((fakeAgent.step as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it('captures + attaches a screenshot artifact when artifacts resource is provided', async () => {
    const { inv, run, calls } = await setup();

    const screenshot = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const fakeAgent: BrowserUseLike = {
      step: vi.fn(async () => ({ action: 'navigate', target: 'https://x', done: false })),
      screenshot,
    };
    const wrapped = instrumentBrowserUse(fakeAgent, run, { artifacts: inv.artifacts });

    await wrapped.step!();
    await run.finish();

    expect(screenshot).toHaveBeenCalledOnce();
    const initCall = calls.find((c) => c.path === '/v1/artifacts');
    expect(initCall).toBeDefined();
    expect((initCall!.body as { kind: string }).kind).toBe('screenshot');

    const browserNode = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => c.body as PostedNode[])
      .find((n) => n.action_type === 'browser_action');
    expect(browserNode?.custom_fields?.attachments).toBeDefined();
    expect((browserNode!.custom_fields!.attachments as unknown[])).toHaveLength(1);
  });

  it('records the error and rethrows when the step throws', async () => {
    const { inv, run, calls } = await setup();
    const boom = new Error('selector not found');
    const fakeAgent: BrowserUseLike = {
      step: vi.fn(async () => {
        throw boom;
      }),
    };
    const wrapped = instrumentBrowserUse(fakeAgent, run);

    await expect(wrapped.step!()).rejects.toBe(boom);

    const nodes = calls
      .filter((c) => c.path === '/v1/nodes')
      .flatMap((c) => c.body as PostedNode[]);
    const errNode = nodes.find((n) => n.action_type === 'browser_action');
    expect(errNode?.metadata?.browser).toMatchObject({ status: 'error' });
    expect(errNode?.error).toMatchObject({ message: 'selector not found' });
  });

  it('does not capture screenshots when no artifacts resource is passed', async () => {
    const { run, calls } = await setup();
    const screenshot = vi.fn(async () => new Uint8Array([1]));
    const fakeAgent: BrowserUseLike = {
      step: vi.fn(async () => ({ action: 'click', done: true })),
      screenshot,
    };
    const wrapped = instrumentBrowserUse(fakeAgent, run);
    await wrapped.step!();
    expect(screenshot).not.toHaveBeenCalled();
    expect(calls.find((c) => c.path === '/v1/artifacts')).toBeUndefined();
  });
});
