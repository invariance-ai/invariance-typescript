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
  const http = (inv as unknown as { operators: { http: HttpClient } }).operators.http;

  const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/v1/operators') {
      return {
        agent: {
          id: 'op_1',
          name: 'Hardik',
          public_key: null,
          project_id: 'proj_1',
          created_at: '2026-01-01T00:00:00Z',
          operator_type: (body as { operator_type?: string }).operator_type ?? 'agent',
        },
        api_key: { id: 'k_1', prefix: 'inv_test', label: 'k', created_at: '', key: 'inv_test_xyz' },
      };
    }
    if (method === 'GET' && path === '/v1/operators/me') {
      return {
        operator: {
          id: 'op_self',
          name: 'me',
          public_key: null,
          project_id: 'proj_1',
          created_at: '',
          operator_type: 'agent',
        },
        api_key: { id: 'k_1', prefix: 'inv_test', label: 'k', created_at: '' },
      };
    }
    if (method === 'GET' && path.startsWith('/v1/operators/op_')) {
      return {
        operator: {
          id: 'op_42',
          name: 'x',
          public_key: null,
          project_id: 'proj_1',
          created_at: '',
          operator_type: 'human',
        },
      };
    }
    if (method === 'GET' && path.startsWith('/v1/operators')) {
      return { data: [], next_cursor: null };
    }
    return {};
  };
  (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
  (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
  return { inv, calls };
}

describe('OperatorsResource', () => {
  it('me() hits /v1/operators/me', async () => {
    const { inv, calls } = stubbed();
    const res = await inv.operators.me();
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/operators/me', body: undefined });
    expect(res.operator.id).toBe('op_self');
  });

  it('create() POSTs operator payload and returns api_key with raw value', async () => {
    const { inv, calls } = stubbed();
    const res = await inv.operators.create({
      name: 'Hardik',
      project_id: 'proj_1',
      operator_type: 'human',
    });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/v1/operators');
    expect(calls[0].body).toEqual({
      name: 'Hardik',
      project_id: 'proj_1',
      operator_type: 'human',
    });
    expect(res.agent.operator_type).toBe('human');
    expect(res.api_key.key).toBe('inv_test_xyz');
  });

  it('create() omits operator_type when not provided (server defaults to agent)', async () => {
    const { inv, calls } = stubbed();
    await inv.operators.create({ name: 'a', project_id: 'p' });
    expect((calls[0].body as Record<string, unknown>).operator_type).toBeUndefined();
  });

  it('list() forwards project_id and operator_type as query params', async () => {
    const { inv, calls } = stubbed();
    await inv.operators.list({ project_id: 'proj_1', operator_type: 'human' });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].path).toBe('/v1/operators?project_id=proj_1&operator_type=human');
  });

  it('get(id) hits /v1/operators/:id and unwraps the operator', async () => {
    const { inv, calls } = stubbed();
    const op = await inv.operators.get('op_42');
    expect(calls[0]).toEqual({ method: 'GET', path: '/v1/operators/op_42', body: undefined });
    expect(op.operator_type).toBe('human');
  });
});
