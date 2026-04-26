import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult, parseJsonArg } from '../util.js';

export function registerNodeTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_node_write',
    'Write a node to an Invariance run',
    {
      run_id: z.string().describe('Run ID'),
      action_type: z.string().describe('Action type (e.g. tool_call, llm_call)'),
      type: z.string().optional().describe('Declared custom node type'),
      input: z.string().optional().describe('Input as a JSON string'),
      output: z.string().optional().describe('Output as a JSON string'),
      error: z.string().optional().describe('Error as a JSON string'),
      metadata: z.string().optional().describe('Metadata JSON object string'),
      custom_fields: z.string().optional().describe('Custom fields JSON object string'),
    },
    async ({ run_id, action_type, type, input, output, error, metadata, custom_fields }) => {
      const nodes = await inv.nodes.write(run_id, [{
        action_type,
        type,
        input: parseJsonArg('input', input),
        output: parseJsonArg('output', output),
        error: parseJsonArg('error', error),
        metadata: parseJsonArg('metadata', metadata) as Record<string, unknown> | undefined,
        custom_fields: parseJsonArg('custom_fields', custom_fields) as Record<string, unknown> | undefined,
      }]);
      return jsonResult(nodes[0]);
    },
  );

  server.tool(
    'invariance_node_list',
    'List nodes for an Invariance run',
    {
      run_id: z.string().describe('Run ID'),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
    },
    async ({ run_id, cursor, limit }) => jsonResult(await inv.nodes.list(run_id, { cursor, limit })),
  );
}
