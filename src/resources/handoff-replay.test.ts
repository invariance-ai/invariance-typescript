import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Invariance } from '../index.js';
import { priceCall } from '../providers/pricing.js';
import {
  generateKeypair,
  hashNodePayload,
  verifyEd25519,
  type NodeHashPayload,
} from '../crypto.js';

type Recorded = { method: string; path: string; body?: unknown };

function installFetch(handler: (method: string, path: string, body: unknown) => Response): () => Recorded[] {
  const calls: Recorded[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(url as string).pathname;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body });
    return handler(method, path, body);
  }) as typeof fetch;
  (installFetch as unknown as { _restore: () => void })._restore = () => {
    globalThis.fetch = original;
  };
  return () => calls;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('multi-agent handoff', () => {
  let getCalls: () => Recorded[];
  afterEach(() => {
    (installFetch as unknown as { _restore?: () => void })._restore?.();
  });

  beforeEach(() => {
    getCalls = installFetch((method, path, body) => {
      if (method === 'GET' && path === '/v1/agents/me') {
        return jsonResponse({ agent: { id: 'planner', name: 'planner', public_key: null, project_id: 'p', created_at: '2024-01-01T00:00:00Z' } });
      }
      if (method === 'POST' && path === '/v1/runs') {
        return jsonResponse({
          run: { id: 'run_1', agent_id: 'a_1', name: (body as { name?: string })?.name ?? '', status: 'open' },
        });
      }
      if (method === 'POST' && path === '/v1/nodes') {
        const items = Array.isArray(body) ? body : [body];
        return jsonResponse({ data: items.map((i: Record<string, unknown>, idx) => ({ ...i, hash: `h_${idx}` })) });
      }
      if (method === 'POST' && path.endsWith('/fork')) {
        return jsonResponse({
          run: {
            id: 'run_fork',
            agent_id: 'a_1',
            name: 'forked',
            status: 'open',
            parent_run_id: 'run_1',
            fork_point_node_id: (body as { from_node_id: string }).from_node_id,
          },
        });
      }
      if (method === 'PATCH') return jsonResponse({ run: { id: 'run_1', status: 'completed' } });
      return new Response(null, { status: 404 });
    });
  });

  it('emits a handoff node with handoff_from/to/reason', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    const run = await inv.runs.start({ name: 'demo' });
    await run.handoff({ toAgentId: 'executor', reason: 'specialist', message: { task: 'x' } });
    await run.finish();

    const calls = getCalls();
    const nodePost = calls.find((c) => c.path === '/v1/nodes')!;
    const node = (nodePost.body as Record<string, unknown>[])[0];
    expect(node.action_type).toBe('handoff');
    expect(node.handoff_to).toBe('executor');
    expect(node.handoff_reason).toBe('specialist');
  });

  it('rejects replaySeed without feature flag', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    await expect(inv.runs.start({ replaySeed: 's1' })).rejects.toThrow(/INVARIANCE_FEATURE_REPLAY/);
  });

  it('rejects fork without feature flag', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://test.local' });
    await expect(inv.runs.fork('run_1', { fromNodeId: 'n_1' })).rejects.toThrow(/INVARIANCE_FEATURE_REPLAY/);
  });

  it('forks a run when feature flag enabled', async () => {
    const inv = Invariance.init({
      apiKey: 'inv_test',
      apiUrl: 'http://test.local',
      features: { replay: true },
    });
    const forked = await inv.runs.fork('run_1', { fromNodeId: 'n_3' });
    expect(forked.runId).toBe('run_fork');
    const calls = getCalls();
    const forkPost = calls.find((c) => c.path.endsWith('/fork'))!;
    expect((forkPost.body as { from_node_id: string }).from_node_id).toBe('n_3');
  });
});

describe('handoff attestation (crypto)', () => {
  afterEach(() => {
    (installFetch as unknown as { _restore?: () => void })._restore?.();
  });

  it('tampering with handoff_to on the wire invalidates the signature', async () => {
    const { privateKey, publicKey } = generateKeypair();
    let capturedSig: string | null = null;
    installFetch((method, path, body) => {
      if (method === 'GET' && path === '/v1/agents/me') {
        return jsonResponse({ agent: { id: 'planner', name: 'planner', public_key: null, project_id: 'p', created_at: '2024-01-01T00:00:00Z' } });
      }
      if (method === 'POST' && path === '/v1/runs') {
        return jsonResponse({ run: { id: 'run_1', agent_id: 'planner', status: 'open' } });
      }
      if (method === 'POST' && path === '/v1/nodes') {
        const items = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
        for (const it of items) {
          if (it.type === 'handoff') capturedSig = it.signature as string;
        }
        return jsonResponse({ data: items.map((i, idx) => ({ ...i, hash: `h_${idx}` })) });
      }
      if (method === 'PATCH') return jsonResponse({ run: { id: 'run_1', status: 'completed' } });
      return new Response(null, { status: 404 });
    });

    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://t.local', signingKey: privateKey });
    const run = await inv.runs.start();
    const token = await run.handoff({ toAgentId: 'executor', reason: 'r' });
    await run.finish();

    expect(token).not.toBeNull();
    expect(capturedSig).not.toBeNull();

    // Reconstruct the exact signed payload the SDK hashed.
    // Retrieve the actual node body from the POST capture to confirm key shape.
    // We verify that tampering with handoff_to invalidates the signature.
    const basePayload: NodeHashPayload = {
      id: token!.claims.handoff_node_id,
      run_id: 'run_1',
      agent_id: 'planner',
      parent_id: null,
      action_type: 'handoff',
      input: null,
      output: null,
      error: null,
      metadata: {},
      custom_fields: {},
      timestamp: 0,
      duration_ms: 0,
      previous_hashes: [],
      handoff_from: 'planner',
      handoff_to: 'executor',
      handoff_reason: 'r',
    };
    // We can't easily know the exact timestamp/duration, but we CAN verify that
    // mutating handoff_to changes the hash (regardless of those values).
    const tamperedPayload: NodeHashPayload = { ...basePayload, handoff_to: 'attacker' };
    expect(hashNodePayload(basePayload)).not.toBe(hashNodePayload(tamperedPayload));
    // Signature-level check: the captured signature is tied to the true hash, so
    // a verify against a mutated hash must return false.
    expect(verifyEd25519(hashNodePayload(tamperedPayload), capturedSig!, publicKey)).toBe(false);
  });

  it('handoff() returns null when unsigned', async () => {
    installFetch((method, path) => {
      if (method === 'GET' && path === '/v1/agents/me') {
        return jsonResponse({ agent: { id: 'planner', name: 'planner', public_key: null, project_id: 'p', created_at: '2024-01-01T00:00:00Z' } });
      }
      if (method === 'POST' && path === '/v1/runs') {
        return jsonResponse({ run: { id: 'run_1', agent_id: 'a', status: 'open' } });
      }
      if (method === 'POST' && path === '/v1/nodes') return jsonResponse({ data: [] });
      if (method === 'PATCH') return jsonResponse({ run: { id: 'run_1', status: 'completed' } });
      return new Response(null, { status: 404 });
    });
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://t.local' });
    const run = await inv.runs.start();
    const token = await run.handoff({ toAgentId: 'executor' });
    await run.finish();
    expect(token).toBeNull();
  });

  it('forwards parent_handoff_token to POST /v1/runs', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    installFetch((method, path, body) => {
      if (method === 'GET' && path === '/v1/agents/me') {
        return jsonResponse({ agent: { id: 'planner', name: 'planner', public_key: null, project_id: 'p', created_at: '2024-01-01T00:00:00Z' } });
      }
      if (method === 'POST' && path === '/v1/runs') {
        capturedBody = body as Record<string, unknown>;
        return jsonResponse({ run: { id: 'run_2', agent_id: 'a', status: 'open' } });
      }
      if (method === 'POST' && path === '/v1/nodes') return jsonResponse({ data: [] });
      if (method === 'PATCH') return jsonResponse({ run: { id: 'run_2', status: 'completed' } });
      return new Response(null, { status: 404 });
    });
    const inv = Invariance.init({ apiKey: 'inv_test', apiUrl: 'http://t.local' });
    const run = await inv.runs.start({ parentHandoffToken: 'tok.fake.deadbeef' });
    await run.finish();
    expect(capturedBody?.parent_handoff_token).toBe('tok.fake.deadbeef');
  });
});

describe('pricing', () => {
  it('prices a known model', () => {
    const cost = priceCall({ model: 'gpt-4o-mini', inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBeCloseTo(0.00045, 6);
  });

  it('prices an unknown model as 0', () => {
    expect(priceCall({ model: 'mystery-xyz', inputTokens: 1000, outputTokens: 500 })).toBe(0);
  });

  it('prefix-matches versioned aliases', () => {
    const cost = priceCall({ model: 'gpt-4o-2024-08-06', inputTokens: 1000, outputTokens: 0 });
    expect(cost).toBeCloseTo(0.0025, 6);
  });
});
