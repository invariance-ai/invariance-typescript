import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult, parseJsonArg } from '../util.js';

export function registerRunTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_run_start',
    'Start a new Invariance run',
    {
      name: z.string().optional().describe('Run name'),
      metadata: z.string().optional().describe('JSON object string of run metadata'),
    },
    async ({ name, metadata }) => {
      const run = await inv.runs.start({
        name,
        metadata: parseJsonArg('metadata', metadata) as Record<string, unknown> | undefined,
      });
      return jsonResult({ id: run.runId, name: run.name, status: run.status });
    },
  );

  server.tool(
    'invariance_run_get',
    'Get details of an Invariance run',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return jsonResult({ id: run.runId, name: run.name, status: run.status });
    },
  );

  server.tool(
    'invariance_run_list',
    'List Invariance runs (paginated)',
    {
      cursor: z.string().optional().describe('Pagination cursor from a previous response'),
      limit: z.number().int().positive().max(200).optional().describe('Max items (default backend page size)'),
    },
    async ({ cursor, limit }) => jsonResult(await inv.runs.list({ cursor, limit })),
  );

  server.tool(
    'invariance_run_finish',
    'Mark a run as completed',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      const finished = await run.finish();
      return jsonResult(finished);
    },
  );

  server.tool(
    'invariance_run_fail',
    'Mark a run as failed',
    {
      id: z.string().describe('Run ID'),
      error: z.string().optional().describe('Error description'),
    },
    async ({ id, error }) => {
      const run = await inv.runs.get(id);
      const failed = await run.fail(error);
      return jsonResult(failed);
    },
  );

  server.tool(
    'invariance_run_verify',
    'Verify the proof chain for an Invariance run',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return jsonResult(await run.verify());
    },
  );
}
