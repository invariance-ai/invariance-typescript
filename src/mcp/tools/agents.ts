import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Invariance } from '../../index.js';
import { jsonResult } from '../util.js';

export function registerAgentTools(server: McpServer, inv: Invariance): void {
  server.tool(
    'invariance_agent_me',
    'Show the authenticated agent and API key',
    {},
    async () => jsonResult(await inv.agents.me()),
  );

  server.tool(
    'invariance_agent_set_key',
    'Register or rotate the calling agent\'s Ed25519 public key (32-byte hex, 64 chars)',
    { public_key: z.string().describe('Ed25519 public key as hex (64 chars)') },
    async ({ public_key }) => jsonResult(await inv.agents.setPublicKey(public_key)),
  );
}
