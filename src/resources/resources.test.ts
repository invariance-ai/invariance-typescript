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
    if (path === '/v1/cases/case_1/events' && method === 'POST') {
      return { event: { id: 'wev_1', ...(body as Record<string, unknown>) } };
    }
    if (path.startsWith('/v1/cases/case_1/events') || path.startsWith('/v1/events')) {
      return { data: [], next_cursor: null };
    }
    if (path === '/v1/workflow-definitions' && method === 'POST') {
      return { definition: { key: 'support.escalation', display_name: 'Support Escalation', ...(body as Record<string, unknown>) } };
    }
    if (path === '/v1/workflow-definitions' && method === 'GET') {
      return { data: [] };
    }
    if (path.startsWith('/v1/workflow-definitions/')) {
      return { definition: { key: 'support.escalation', display_name: 'Support Escalation' } };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  (http as unknown as { delete: unknown }).delete = (p: string) => record('DELETE', p);
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

describe('workflow resources', () => {
  it('creates and lists workflow events', async () => {
    const { inv, calls } = stubbed();
    await inv.cases.createEvent('case_1', {
      type: 'agent.triaged',
      actorType: 'agent',
      payload: { category: 'billing' },
      evidenceNodeIds: ['node_1'],
    });
    await inv.cases.listEvents('case_1', { limit: 10 });
    await inv.events.list({ workflowKey: 'support.escalation', actorType: 'human' });

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/cases/case_1/events',
      body: {
        type: 'agent.triaged',
        actor_type: 'agent',
        payload: { category: 'billing' },
        evidence_node_ids: ['node_1'],
      },
    });
    expect(calls[1].path).toBe('/v1/cases/case_1/events?limit=10');
    expect(calls[2].path).toBe('/v1/events?workflow_key=support.escalation&actor_type=human');
  });

  it('manages workflow definitions', async () => {
    const { inv, calls } = stubbed();
    await inv.workflowDefinitions.create({
      key: 'support.escalation',
      displayName: 'Support Escalation',
      expectedFields: [{ name: 'ticket_id', type: 'string', required: true }],
    });
    await inv.workflowDefinitions.update('support.escalation', {
      displayName: 'Support Escalation v2',
    });
    await inv.workflowDefinitions.delete('support.escalation');

    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/workflow-definitions',
      body: {
        key: 'support.escalation',
        display_name: 'Support Escalation',
        expected_fields: [{ name: 'ticket_id', type: 'string', required: true }],
      },
    });
    expect(calls[1]).toEqual({
      method: 'PATCH',
      path: '/v1/workflow-definitions/support.escalation',
      body: { display_name: 'Support Escalation v2' },
    });
    expect(calls[2]).toEqual({
      method: 'DELETE',
      path: '/v1/workflow-definitions/support.escalation',
      body: undefined,
    });
  });
});
