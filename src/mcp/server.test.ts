/**
 * MCP server tests (TS-001).
 *
 * Spawns the built MCP server over stdio and exercises all 8 tools.
 * Currently todo — needs the dist build + a test harness for stdio JSON-RPC.
 */
import { describe, it } from 'vitest';

describe('MCP server tools', () => {
  it.todo('lists 8 tools (create_run, get_run, list_runs, write_node, list_nodes, verify_run, …)');
  it.todo('invariance_create_run returns Run with shape matching api-types Run');
  it.todo('invariance_write_node persists a node and returns id + hash');
  it.todo('invariance_verify_run returns RunProof with reason in linkage|hash|signature|missing_key');
  it.todo('invariance_list_runs paginates with cursor');
  it.todo('invariance_get_run returns 404-shaped error for unknown id (does not crash server)');
  it.todo('invalid JSON arg surfaces a structured error, not a stack trace');
  it.todo('process exits cleanly on stdin close');
});
