import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Invariance } from '../index.js';
import { DEFAULT_API_URL } from '../config.js';

function parseJsonArg(name: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON in "${name}": ${(err as Error).message}`);
  }
}

export function createMcpServer(): McpServer {
  const apiKey = process.env.INVARIANCE_API_KEY;
  if (!apiKey) {
    throw new Error('INVARIANCE_API_KEY is required');
  }

  const inv = Invariance.init({
    apiKey,
    apiUrl: process.env.INVARIANCE_API_URL ?? DEFAULT_API_URL,
  });

  const server = new McpServer({
    name: 'invariance',
    version: '0.0.0',
  });

  // ── Create Run ──────────────────────────────────────────────────

  server.tool(
    'invariance_create_run',
    'Start a new Invariance run/session',
    { name: z.string().optional().describe('Run name') },
    async ({ name }) => {
      const run = await inv.runs.start({ name });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id: run.sessionId, name: run.name, status: run.status }),
        }],
      };
    },
  );

  // ── Get Run ─────────────────────────────────────────────────────

  server.tool(
    'invariance_get_run',
    'Get details of an Invariance run',
    { id: z.string().describe('Run/session ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id: run.sessionId, name: run.name, status: run.status }),
        }],
      };
    },
  );

  // ── List Runs ───────────────────────────────────────────────────

  server.tool(
    'invariance_list_runs',
    'List Invariance runs',
    {},
    async () => {
      const result = await inv.runs.list();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result),
        }],
      };
    },
  );

  // ── Write Node ──────────────────────────────────────────────────

  server.tool(
    'invariance_write_node',
    'Write a node to an Invariance run',
    {
      session_id: z.string().describe('Session/run ID'),
      action_type: z.string().describe('Action type (e.g. tool_call, llm_call)'),
      input: z.string().optional().describe('Input JSON string'),
      output: z.string().optional().describe('Output JSON string'),
    },
    async ({ session_id, action_type, input, output }) => {
      const nodes = await inv.nodes.write(session_id, [{
        action_type,
        input: parseJsonArg('input', input),
        output: parseJsonArg('output', output),
      }]);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(nodes[0]),
        }],
      };
    },
  );

  // ── List Nodes ──────────────────────────────────────────────────

  server.tool(
    'invariance_list_nodes',
    'List nodes for an Invariance run',
    { session_id: z.string().describe('Session/run ID') },
    async ({ session_id }) => {
      const result = await inv.nodes.list(session_id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result),
        }],
      };
    },
  );

  // ── Verify Run ──────────────────────────────────────────────────

  server.tool(
    'invariance_verify_run',
    'Verify the proof chain for an Invariance run',
    { id: z.string().describe('Session/run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      const proof = await run.verify();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(proof),
        }],
      };
    },
  );

  return server;
}

// Entry point
async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
