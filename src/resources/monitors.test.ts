import { describe, it, expect } from 'vitest';
import { compileMonitor, on, rule, evaluator, action } from './monitors.js';
import { defineNodeType } from './node-types.js';

describe('compileMonitor', () => {
  it('compiles a session-scoped field rule', () => {
    const def = compileMonitor({
      name: 'pii_leak',
      on: on.session({ id: 'sess_1' }),
      when: rule.fieldContains('output', 'ssn'),
      do: action.createFinding({ severity: 'high', title: 'PII leak' }),
    });
    expect(def.target).toBe('session');
    expect(def.target_match.scope).toBe('session');
    expect(def.target_match.filters).toEqual([
      { field: 'session_id', operator: 'eq', value: 'sess_1' },
    ]);
    expect(def.rules).toEqual([
      { kind: 'field_match', field: 'output', operator: 'contains', value: 'ssn' },
    ]);
    expect(def.actions?.[0]).toMatchObject({ type: 'create_finding', severity: 'high' });
    expect(def.signal).toMatchObject({ severity: 'high', title: 'PII leak' });
  });

  it('compiles a node-type selector with numeric threshold', () => {
    const BillingCharge = defineNodeType<{ amount_cents: number }>('billing_charge');
    const def = compileMonitor({
      name: 'expensive',
      on: on.node({ type: BillingCharge.type }),
      when: rule.numeric('custom_fields.amount_cents', 'gt', 10000),
      do: action.notify('slack', '#billing'),
    });
    expect(def.target_match.scope).toBe('node');
    expect(def.target_match.filters).toContainEqual({
      field: 'type',
      operator: 'eq',
      value: 'billing_charge',
    });
    expect(def.rules[0]).toMatchObject({
      kind: 'numeric_threshold',
      operator: 'gt',
      value: 10000,
    });
  });

  it('compiles an LLM judge over an agent run', () => {
    const def = compileMonitor({
      name: 'judge_refunds',
      on: on.run({ agent_id: 'agt_support' }),
      when: evaluator.judgeLLM({
        model: 'claude-sonnet-4-6',
        rubric: 'Refund without approval?',
      }),
      do: action.emitSignal({ severity: 'medium', title: 'Unapproved refund' }),
    });
    expect(def.evaluator).toMatchObject({
      type: 'judge_llm',
      model: 'claude-sonnet-4-6',
      rubric: 'Refund without approval?',
    });
    expect(def.rules).toEqual([]);
    expect(def.target_match.filters).toEqual([
      { field: 'agent_id', operator: 'eq', value: 'agt_support' },
    ]);
  });

  it('compiles composite rules with match=any', () => {
    const def = compileMonitor({
      name: 'combo',
      on: on.agent('agt_x'),
      when: rule.any(
        rule.fieldEquals('status', 'error'),
        rule.exists('error'),
      ),
      do: action.mark('reviewed'),
    });
    expect(def.match).toBe('any');
    expect(def.rules).toHaveLength(2);
    expect(def.actions?.[0]).toEqual({ type: 'mark_object', label: 'reviewed' });
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
