/**
 * Typed nodes: tool_call ships as a built-in, and you can register your own.
 *
 * Why: the dashboard's TypedNodePanel renders per-tool / per-retriever /
 * per-{your-type} aggregates — count, error rate, p95 latency, grouped by the
 * type's `key_field`. You get that panel for free by emitting typed nodes.
 *
 * Run: `pnpm tsx examples/typed-nodes.ts`
 * Requires `INVARIANCE_API_KEY` + `INVARIANCE_API_URL` in env.
 */
import { Invariance, defineToolCallType, defineNodeType } from '../src/index.js';

// Built-in. The seed at `nt_system_tool_call` validates tool_name + status.
const ToolCall = defineToolCallType();

// Custom. The SDK registers it on first use; key_field makes the dashboard
// group by retriever_name, status_field drives the error coloring.
interface RetrievalFields extends Record<string, unknown> {
  retriever_name: string;
  query: string;
  k: number;
  hit_count: number;
  status: 'success' | 'error';
}
const Retrieval = defineNodeType<RetrievalFields>('retrieval');

async function main() {
  const client = Invariance.init();

  await client.nodeTypes.register({
    name: 'retrieval',
    display_name: 'Retrieval',
    custom_fields_schema: {
      required: ['retriever_name', 'query', 'status'],
      field_types: {
        retriever_name: 'string',
        query: 'string',
        k: 'number',
        hit_count: 'number',
        status: 'string',
      },
    },
    aggregation_hints: {
      key_field: 'retriever_name',
      status_field: 'status',
      aggregate_fields: ['hit_count'],
    },
  });

  const { id: runId } = await client.runs.create({ name: 'typed-nodes demo' });

  await client.nodes.write(runId, [
    ToolCall.node({
      action_type: 'tool.use',
      custom_fields: { tool_name: 'web_search', status: 'success', latency_ms: 142 },
      duration_ms: 142,
    }),
    ToolCall.node({
      action_type: 'tool.use',
      custom_fields: { tool_name: 'code_exec', status: 'error', latency_ms: 31 },
      duration_ms: 31,
      error: { message: 'syntax error' },
    }),
    Retrieval.node({
      action_type: 'retrieve',
      custom_fields: {
        retriever_name: 'docs_hybrid',
        query: 'invariance observability',
        k: 5,
        hit_count: 5,
        status: 'success',
      },
      duration_ms: 58,
    }),
  ]);

  await client.runs.update(runId, { status: 'completed' });
  console.log(`Run ${runId} done. Open the dashboard to see typed panels.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
