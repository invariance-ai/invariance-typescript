import type { HttpClient } from '../client.js';
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

/** Shape enforced by the built-in `tool_call` node type seeded by the platform. */
export interface ToolCallFields extends Record<string, unknown> {
  tool_name: string;
  status: 'success' | 'error';
  tool_input?: unknown;
  tool_output?: unknown;
  latency_ms?: number;
}

/**
 * Convenience wrapper for the built-in `tool_call` node type. Pre-bound to the
 * system seed — no need to register it. Pass an extension generic to add your
 * own fields on top of the tool_call base shape.
 *
 *   const ToolCall = defineToolCallType();
 *   await client.nodes.write(runId, [ToolCall.node({
 *     action_type: 'tool.use',
 *     custom_fields: { tool_name: 'search', status: 'success', latency_ms: 120 },
 *   })]);
 */
export function defineToolCallType<T extends ToolCallFields = ToolCallFields>(): NodeType<T> {
  return defineNodeType<T>('tool_call');
}

// ── Registry API ────────────────────────────────────────────────────────────

export interface NodeTypeFieldMap {
  [field: string]: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

export interface NodeTypeSchema {
  required?: string[];
  field_types?: NodeTypeFieldMap;
}

export interface NodeTypeAggregationHints {
  key_field?: string;
  status_field?: string;
  aggregate_fields?: string[];
}

export interface NodeTypeRecord {
  id: string;
  project_id: string | null;
  name: string;
  display_name: string;
  custom_fields_schema: NodeTypeSchema;
  aggregation_hints: NodeTypeAggregationHints;
  created_at: string;
  updated_at: string;
}

export interface RegisterNodeTypeInput {
  name: string;
  display_name?: string;
  custom_fields_schema?: NodeTypeSchema;
  aggregation_hints?: NodeTypeAggregationHints;
}

export class NodeTypesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<NodeTypeRecord[]> {
    const res = await this.http.get<{ data: NodeTypeRecord[] }>('/v1/node-types');
    return res.data;
  }

  async register(input: RegisterNodeTypeInput): Promise<NodeTypeRecord> {
    const res = await this.http.post<{ node_type: NodeTypeRecord }>('/v1/node-types', input);
    return res.node_type;
  }
}
