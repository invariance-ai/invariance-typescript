import type { WriteNodeInput } from './nodes.js';

/**
 * Declare a reusable node type with a typed shape for `custom_fields`.
 * The returned helper stamps `type` on writes and narrows `custom_fields`
 * to the declared generic — used both for IDE safety and as a selector
 * dimension for Monitors (see `on.node({ type })`).
 *
 *   const BillingCharge = defineNodeType<{ user_id: string; amount_cents: number }>('billing_charge');
 *   client.nodes.write(runId, [BillingCharge.node({
 *     action_type: 'tool.use',
 *     custom_fields: { user_id: 'u_1', amount_cents: 500 },
 *   })]);
 */
export interface NodeType<T extends Record<string, unknown>> {
  readonly type: string;
  node(
    input: Omit<WriteNodeInput, 'custom_fields' | 'type'> & { custom_fields: T },
  ): WriteNodeInput & { type: string; custom_fields: T };
}

export function defineNodeType<T extends Record<string, unknown> = Record<string, unknown>>(
  type: string,
): NodeType<T> {
  return {
    type,
    node(input) {
      return { ...input, type };
    },
  };
}
