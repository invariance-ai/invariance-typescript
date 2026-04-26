import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult } from '../util.js';

export function registerInsightTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_narrative_get',
    'Fetch (or regenerate) the LLM-synthesized narrative for a run',
    {
      run_id: z.string(),
      refresh: z.boolean().optional().describe('Force regeneration of the narrative'),
    },
    async ({ run_id, refresh }) => jsonResult(await inv.narratives.get(run_id, { refresh })),
  );

  server.tool(
    'invariance_ask',
    'Ask a question against the agent\'s knowledge base / runs (turn-based session)',
    {
      message: z.string().describe('Natural language question'),
      session_id: z.string().optional().describe('Continue an existing ask session'),
      model: z.string().optional(),
      max_turns: z.number().int().positive().max(20).optional(),
    },
    async ({ message, session_id, model, max_turns }) => jsonResult(
      await inv.ask.send({ message, session_id, model, max_turns }),
    ),
  );

  server.tool(
    'invariance_kb_pages_list',
    'List knowledge-base pages',
    {
      kind: z.enum(['wiki', 'run', 'note']).optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ kind, search, cursor, limit }) => jsonResult(
      await inv.kb.pages.list({ kind, search, cursor, limit }),
    ),
  );

  server.tool(
    'invariance_kb_page_get',
    'Get a knowledge-base page by ID',
    { id: z.string() },
    async ({ id }) => jsonResult(await inv.kb.pages.get(id)),
  );
}
