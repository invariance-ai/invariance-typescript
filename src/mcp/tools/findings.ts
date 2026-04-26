import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult } from '../util.js';

const statusEnum = z.enum(['open', 'review_requested', 'resolved', 'dismissed']);

export function registerFindingTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_finding_list',
    'List findings',
    {
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) => jsonResult(await inv.findings.list({ cursor, limit })),
  );

  server.tool(
    'invariance_finding_get',
    'Get a finding by ID',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.findings.get(id)),
  );

  server.tool(
    'invariance_finding_update',
    'Update a finding\'s status',
    { id: z.string(), status: statusEnum },
    async ({ id, status }) => jsonResult(await inv.findings.update(id, { status })),
  );
}
