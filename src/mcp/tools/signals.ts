import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import type { Severity } from '../../resources/monitors.js';
import { jsonResult, parseJsonArg } from '../util.js';

const severityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export function registerSignalTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_signal_emit',
    'Emit a manual signal',
    {
      severity: severityEnum,
      title: z.string(),
      message: z.string().optional(),
      type: z.string().optional().describe('Signal type identifier'),
      data: z.string().optional().describe('Arbitrary signal payload as a JSON string'),
      run_id: z.string().optional(),
      node_id: z.string().optional(),
    },
    async ({ severity, title, message, type, data, run_id, node_id }) => jsonResult(
      await inv.signals.emit({
        severity: severity as Severity,
        title,
        message,
        type,
        data: parseJsonArg('data', data),
        run_id,
        node_id,
      }),
    ),
  );

  server.tool(
    'invariance_signal_list',
    'List signals',
    {
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) => jsonResult(await inv.signals.list({ cursor, limit })),
  );

  server.tool(
    'invariance_signal_get',
    'Get a signal by ID',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.signals.get(id)),
  );

  server.tool(
    'invariance_signal_acknowledge',
    'Acknowledge a signal',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.signals.acknowledge(id)),
  );

  server.tool(
    'invariance_signal_resolve',
    'Resolve a signal',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.signals.resolve(id)),
  );
}
