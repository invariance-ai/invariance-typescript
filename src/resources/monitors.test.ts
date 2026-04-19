import { describe, it, expect } from 'vitest';
import { compileMonitor, on, rule, action, MonitorsResource } from './monitors.js';
import { defineNodeType } from './node-types.js';
import { HttpClient } from '../client.js';

describe('compileMonitor → backend CreateMonitorRequest', () => {
  it('field_contains compiles to keyword evaluator', () => {
    const body = compileMonitor({
      name: 'pii_leak',
      on: on.node({ action_type: 'tool.use' }),
      when: rule.fieldContains('output', 'ssn'),
      do: action.emitSignal({ severity: 'high', title: 'PII', type: 'pii' }),
    });
    expect(body).toEqual({
      name: 'pii_leak',
      evaluator: { type: 'keyword', field: 'output', keywords: ['ssn'], case_sensitive: false },
      severity: 'high',
      signal_type: 'pii',
    });
  });

  it('numeric compiles to threshold evaluator', () => {
    const BillingCharge = defineNodeType<{ amount_cents: number }>('billing_charge');
    const body = compileMonitor({
      name: 'expensive',
      on: on.node({ type: BillingCharge.type }),
      when: rule.numeric('custom_fields.amount_cents', 'gt', 10000),
      do: action.emitSignal({ severity: 'medium', title: 'big' }),
    });
    expect(body.evaluator).toEqual({
      type: 'threshold',
      field: 'custom_fields.amount_cents',
      operator: '>',
      value: 10000,
    });
  });

  it('create_finding sets creates_review', () => {
    const body = compileMonitor({
      name: 'x',
      on: on.node({}),
      when: rule.fieldContains('output', 'bad'),
      do: action.createFinding({ severity: 'critical', title: 'Bad', type: 'bad' }),
    });
    expect(body.creates_review).toBe(true);
    expect(body.signal_type).toBe('bad');
  });

  it('numeric eq/neq compile to == / !=', () => {
    const eqBody = compileMonitor({
      name: 'eq',
      on: on.node({}),
      when: rule.numeric('custom_fields.count', 'eq', 0),
      do: action.emitSignal({ severity: 'low', title: 'zero' }),
    });
    expect((eqBody.evaluator as { operator: string }).operator).toBe('==');
    const neqBody = compileMonitor({
      name: 'neq',
      on: on.node({}),
      when: rule.numeric('custom_fields.count', 'neq', 0),
      do: action.emitSignal({ severity: 'low', title: 'nonzero' }),
    });
    expect((neqBody.evaluator as { operator: string }).operator).toBe('!=');
  });
});

describe('defineNodeType', () => {
  it('stamps type on node writes', () => {
    const BillingCharge = defineNodeType<{ amount_cents: number; user_id: string }>(
      'billing_charge',
    );
    const n = BillingCharge.node({
      action_type: 'tool.use',
      custom_fields: { amount_cents: 500, user_id: 'u_1' },
    });
    expect(n.type).toBe('billing_charge');
    expect(n.custom_fields).toEqual({ amount_cents: 500, user_id: 'u_1' });
  });
});

describe('MonitorsResource resource surface', () => {
  function stubHttp(): { http: HttpClient; calls: { method: string; path: string; body: unknown }[] } {
    const calls: { method: string; path: string; body: unknown }[] = [];
    const http = new HttpClient('http://t.local', 'inv_test');
    const record = async (method: string, path: string, body?: unknown): Promise<unknown> => {
      calls.push({ method, path, body });
      return { monitor: { id: 'mon_1', name: 'x', created_at: 0 }, data: [], next_cursor: null };
    };
    (http as unknown as { post: unknown }).post = (p: string, b?: unknown) => record('POST', p, b);
    (http as unknown as { get: unknown }).get = (p: string) => record('GET', p);
    (http as unknown as { request: unknown }).request = (m: string, p: string, b?: unknown) => record(m, p, b);
    return { http, calls };
  }

  it('list forwards params', async () => {
    const { http, calls } = stubHttp();
    const res = new MonitorsResource(http);
    await res.list({ limit: 25 });
    expect(calls[0].path).toBe('/v1/monitors?limit=25');
  });

  it('update PATCHes a patch', async () => {
    const { http, calls } = stubHttp();
    const res = new MonitorsResource(http);
    await res.update('mon_1', { name: 'renamed', enabled: false });
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/v1/monitors/mon_1',
      body: { name: 'renamed', enabled: false },
    });
  });

  it('pause/resume delegate to update with enabled', async () => {
    const { http, calls } = stubHttp();
    const res = new MonitorsResource(http);
    await res.pause('mon_1');
    await res.resume('mon_1');
    expect(calls[0].body).toEqual({ enabled: false });
    expect(calls[1].body).toEqual({ enabled: true });
  });
});
