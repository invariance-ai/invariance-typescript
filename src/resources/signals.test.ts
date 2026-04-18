import { describe, it, expect } from 'vitest';
import { HttpClient } from '../client.js';
import { Invariance } from '../index.js';
import { defineSignalType } from './signal-types.js';
import { action, compileMonitor, on, rule } from './monitors.js';

interface Call {
  method: string;
  path: string;
  body?: unknown;
}

function stubbedInvariance(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });

  const http = (inv as unknown as { signals: { http: HttpClient } }).signals[
    'http' as never
  ] as unknown as HttpClient;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/runs') {
      return {
        run: {
          id: 'run_1',
          agent_id: 'agent_1',
          name: '',
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
      return { data: items.map((item, i) => ({ ...(item as object), hash: `h_${i}` })) };
    }
    if (method === 'POST' && path === '/v1/signals') {
      return { signal: { id: 'signal_1', ...(body as object) } };
    }
    if (method === 'PATCH' && path.startsWith('/v1/runs/')) {
      return {
        run: {
          id: 'run_1',
          agent_id: 'agent_1',
          name: '',
          status: 'completed',
          metadata: {},
          created_at: '',
          updated_at: '',
          closed_at: null,
        },
      };
    }
    return {};
  };

  http.get = ((path: string) => record('GET', path)) as HttpClient['get'];
  http.post = ((path: string, body?: unknown) => record('POST', path, body)) as HttpClient['post'];
  http.patch = ((path: string, body?: unknown) => record('PATCH', path, body)) as HttpClient['patch'];

  const runsHttp = (inv as unknown as { runs: { http: HttpClient } }).runs[
    'http' as never
  ] as unknown as HttpClient;
  runsHttp.get = http.get;
  runsHttp.post = http.post;
  runsHttp.patch = http.patch;

  return { inv, calls };
}

describe('signal types', () => {
  it('defineSignalType stamps type + defaults', () => {
    const Dangerous = defineSignalType<{ reason: string }>('dangerous', {
      severity: 'high',
      title: 'Dangerous',
    });
    expect(Dangerous.signal({ data: { reason: 'x' } })).toEqual({
      type: 'dangerous',
      severity: 'high',
      title: 'Dangerous',
      message: undefined,
      data: { reason: 'x' },
    });
  });

  it('run.signal attaches to last node id', async () => {
    const { inv, calls } = stubbedInvariance();
    const Dangerous = defineSignalType<{ reason: string }>('dangerous', {
      severity: 'high',
      title: 'D',
    });
    await inv.runs.start({ name: 't' }, async (run) => {
      await run.step('tool.use', {}, async (s) => {
        s.output = { answer: 'x' };
      });
      await run.signal(Dangerous.signal({ data: { reason: 'y' } }));
    });

    const emit = calls.find((c) => c.path === '/v1/signals' && c.method === 'POST');
    expect(emit).toBeDefined();
    const body = emit!.body as Record<string, unknown>;
    expect(body.type).toBe('dangerous');
    expect(body.run_id).toBe('run_1');
    expect(typeof body.node_id).toBe('string');
    expect(body.data).toEqual({ reason: 'y' });
  });

  it('action.emitSignal(type=...) threads signal_type into compiled request', () => {
    const body = compileMonitor({
      name: 'x',
      on: on.node({ action_type: 'tool.use' }),
      when: rule.fieldContains('output', 'danger'),
      do: action.emitSignal({ severity: 'high', title: 'D', type: 'dangerous' }),
    });
    expect(body.signal_type).toBe('dangerous');
    expect(body.severity).toBe('high');
  });
});
