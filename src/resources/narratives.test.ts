import { describe, it, expect, beforeEach } from 'vitest';
import { Invariance } from '../index.js';
import { HttpClient } from '../client.js';

interface Call {
  method: string;
  path: string;
}

function stubbed(): { inv: Invariance; calls: Call[] } {
  const calls: Call[] = [];
  const inv = Invariance.init({ apiKey: 'inv_test_abc', apiUrl: 'http://test.local' });
  const http = (inv as unknown as { narratives: { http: HttpClient } }).narratives.http;

  const narrativeFixture = {
    run_id: 'run_1',
    agent_id: 'agent_1',
    narrative: 'Summary text.',
    key_moments: ['moment one'],
    root_cause: 'unit-test',
    scorer: 'severity',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    scored_node_count: 3,
    total_node_count: 10,
    created_at: '2026-04-19T00:00:00Z',
    updated_at: '2026-04-19T00:00:00Z',
  };

  http.get = (async (path: string) => {
    calls.push({ method: 'GET', path });
    return { narrative: narrativeFixture };
  }) as HttpClient['get'];

  return { inv, calls };
}

describe('NarrativesResource.get', () => {
  let inv: Invariance;
  let calls: Call[];
  beforeEach(() => {
    ({ inv, calls } = stubbed());
  });

  it('hits the run narrative endpoint and unwraps the body', async () => {
    const n = await inv.narratives.get('run_1');
    expect(calls).toEqual([{ method: 'GET', path: '/v1/runs/run_1/narrative' }]);
    expect(n.run_id).toBe('run_1');
    expect(n.provider).toBe('anthropic');
    expect(n.scorer).toBe('severity');
  });

  it('passes refresh=true as a query parameter when requested', async () => {
    await inv.narratives.get('run_1', { refresh: true });
    expect(calls[0]!.path).toBe('/v1/runs/run_1/narrative?refresh=true');
  });
});
