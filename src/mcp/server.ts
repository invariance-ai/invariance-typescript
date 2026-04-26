import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Invariance } from '../index.js';
import { DEFAULT_API_URL } from '../config.js';
import { jsonResult, parseJsonArg } from './util.js';
import { registerRunTools } from './tools/runs.js';
import { registerNodeTools } from './tools/nodes.js';
import { registerMonitorTools } from './tools/monitors.js';
import { registerSignalTools } from './tools/signals.js';
import { registerFindingTools } from './tools/findings.js';
import { registerReviewTools } from './tools/reviews.js';
import { registerAgentTools } from './tools/agents.js';
import { registerInsightTools } from './tools/insights.js';

export const SERVER_NAME = 'invariance';
export const SERVER_VERSION = '0.1.2';

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
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerRunTools(server, inv);
  registerNodeTools(server, inv);
  registerMonitorTools(server, inv);
  registerSignalTools(server, inv);
  registerFindingTools(server, inv);
  registerReviewTools(server, inv);
  registerAgentTools(server, inv);
  registerInsightTools(server, inv);
  registerLegacyAliases(server, inv);

  return server;
}

// Legacy tool names kept so existing MCP client configs keep working.
function registerLegacyAliases(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_create_run',
    'Alias of invariance_run_start',
    { name: z.string().optional() },
    async ({ name }) => {
      const run = await inv.runs.start({ name });
      return jsonResult({ id: run.runId, name: run.name, status: run.status });
    },
  );

  server.tool(
    'invariance_get_run',
    'Alias of invariance_run_get',
    { id: z.string() },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return jsonResult({ id: run.runId, name: run.name, status: run.status });
    },
  );

  server.tool(
    'invariance_list_runs',
    'Alias of invariance_run_list',
    {},
    async () => jsonResult(await inv.runs.list()),
  );

  server.tool(
    'invariance_write_node',
    'Alias of invariance_node_write',
    {
      run_id: z.string(),
      action_type: z.string(),
      input: z.string().optional(),
      output: z.string().optional(),
    },
    async ({ run_id, action_type, input, output }) => {
      const nodes = await inv.nodes.write(run_id, [{
        action_type,
        input: parseJsonArg('input', input),
        output: parseJsonArg('output', output),
      }]);
      return jsonResult(nodes[0]);
    },
  );

  server.tool(
    'invariance_list_nodes',
    'Alias of invariance_node_list',
    { run_id: z.string() },
    async ({ run_id }) => jsonResult(await inv.nodes.list(run_id)),
  );

  server.tool(
    'invariance_verify_run',
    'Alias of invariance_run_verify',
    { id: z.string() },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return jsonResult(await run.verify());
    },
  );
}

export async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
