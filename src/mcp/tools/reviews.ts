import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult } from '../util.js';

const decisionEnum = z.enum(['passed', 'failed', 'needs_fix']);

export function registerReviewTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_review_list',
    'List reviews',
    {
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) => jsonResult(await inv.reviews.list({ cursor, limit })),
  );

  server.tool(
    'invariance_review_get',
    'Get a review by ID',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.reviews.get(id)),
  );

  server.tool(
    'invariance_review_claim',
    'Claim a review for the calling agent',
    { id: z.string(), notes: z.string().optional() },
    async ({ id, notes }) => jsonResult(await inv.reviews.claim(id, { notes })),
  );

  server.tool(
    'invariance_review_unclaim',
    'Release a claim on a review',
    { id: z.string(), notes: z.string().optional() },
    async ({ id, notes }) => jsonResult(await inv.reviews.unclaim(id, { notes })),
  );

  server.tool(
    'invariance_review_resolve',
    'Resolve a review with a decision',
    { id: z.string(), decision: decisionEnum, notes: z.string().optional() },
    async ({ id, decision, notes }) => jsonResult(await inv.reviews.resolve(id, { decision, notes })),
  );
}
