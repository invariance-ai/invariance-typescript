import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpServer } from './server.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const API_URL = 'https://api.test';

type RequestRecord = {
  method: string;
  path: string;
  body: unknown;
};

let client: Client;
let server: McpServer;
let requests: RequestRecord[];
let originalEnv: NodeJS.ProcessEnv;

function runFixture(id = 'run_1') {
  return {
    id,
    agent_id: 'agent_1',
    name: 'demo',
    status: 'open',
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
  };
}

function nodeFixture(id = 'node_1') {
  return {
    id,
    run_id: 'run_1',
    agent_id: 'agent_1',
    parent_id: null,
    action_type: 'tool_call',
    type: null,
    input: { prompt: 'ship' },
    output: { result: 'ok' },
    error: null,
    metadata: {},
    custom_fields: {},
    timestamp: 1,
    duration_ms: null,
    hash: 'hash_1',
    previous_hashes: [],
    signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function contentText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = 'content' in result && Array.isArray(result.content)
    ? result.content as Array<{ type?: unknown; text?: unknown }>
    : [];
  const part = content[0];
  if (!part || part.type !== 'text' || typeof part.text !== 'string') {
    throw new Error('Expected text content');
  }
  return part.text;
}

function contentJson(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(contentText(result));
}

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  requests = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: `${url.pathname}${url.search}`, body });

    if (method === 'POST' && url.pathname === '/v1/runs') {
      return jsonResponse({ run: { ...runFixture(), name: body?.name ?? 'demo' } }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/runs') {
      return jsonResponse({ data: [runFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1') {
      return jsonResponse({ run: runFixture() });
    }
    if (method === 'POST' && url.pathname === '/v1/nodes') {
      return jsonResponse({ data: [nodeFixture()] }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/nodes') {
      return jsonResponse({ data: [nodeFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/verify') {
      return jsonResponse({
        run_id: 'run_1',
        valid: true,
        node_count: 1,
        head_hash: 'hash_1',
        first_invalid_node_id: null,
        reason: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/missing') {
      return jsonResponse({ error: { code: 'not_found', message: 'Run missing not found' } }, 404);
    }
    if (method === 'POST' && url.pathname === '/v1/signals') {
      return jsonResponse({
        signal: {
          id: 'sig_1',
          agent_id: 'agent_1',
          monitor_id: null,
          monitor_execution_id: null,
          run_id: body?.run_id ?? null,
          node_id: null,
          source: 'manual',
          severity: body?.severity ?? 'medium',
          title: body?.title ?? '',
          message: body?.message ?? null,
          status: 'open',
          type: body?.type ?? null,
          data: body?.data ?? null,
          acknowledged_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/agents/me') {
      return jsonResponse({
        agent: { id: 'agent_1', name: 'me', public_key: null, project_id: 'p1', created_at: '2026-01-01T00:00:00.000Z' },
      });
    }

    return jsonResponse({ error: { code: 'not_found', message: `${method} ${url.pathname}` } }, 404);
  });

  server = createMcpServer();
  client = new Client({ name: 'mcp-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
  await server.close();
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe('MCP server tools', () => {
  it('lists every Invariance tool plus the legacy aliases', async () => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((tool) => tool.name));

    // Modern names — one per resource action.
    for (const expected of [
      'invariance_run_start', 'invariance_run_get', 'invariance_run_list',
      'invariance_run_finish', 'invariance_run_fail', 'invariance_run_verify',
      'invariance_node_write', 'invariance_node_list',
      'invariance_monitor_create', 'invariance_monitor_list', 'invariance_monitor_get',
      'invariance_monitor_update', 'invariance_monitor_pause', 'invariance_monitor_resume',
      'invariance_monitor_evaluate', 'invariance_monitor_executions', 'invariance_monitor_findings',
      'invariance_signal_emit', 'invariance_signal_list', 'invariance_signal_get',
      'invariance_signal_acknowledge', 'invariance_signal_resolve',
      'invariance_finding_list', 'invariance_finding_get', 'invariance_finding_update',
      'invariance_review_list', 'invariance_review_get', 'invariance_review_claim',
      'invariance_review_unclaim', 'invariance_review_resolve',
      'invariance_agent_me', 'invariance_agent_set_key',
      'invariance_narrative_get', 'invariance_ask',
      'invariance_kb_pages_list', 'invariance_kb_page_get',
    ]) {
      expect(names.has(expected), `missing tool ${expected}`).toBe(true);
    }

    // Legacy aliases retained for backwards compatibility with existing MCP configs.
    for (const legacy of [
      'invariance_create_run', 'invariance_get_run', 'invariance_list_runs',
      'invariance_write_node', 'invariance_list_nodes', 'invariance_verify_run',
    ]) {
      expect(names.has(legacy), `missing legacy alias ${legacy}`).toBe(true);
    }
  });

  it('executes run, node, and proof tools through the SDK HTTP contract', async () => {
    expect(contentJson(await client.callTool({
      name: 'invariance_create_run',
      arguments: { name: 'demo' },
    }))).toEqual({ id: 'run_1', name: 'demo', status: 'open' });

    expect(contentJson(await client.callTool({
      name: 'invariance_get_run',
      arguments: { id: 'run_1' },
    }))).toEqual({ id: 'run_1', name: 'demo', status: 'open' });

    expect(contentJson(await client.callTool({
      name: 'invariance_list_runs',
      arguments: {},
    }))).toEqual({ data: [runFixture()], next_cursor: null });

    const written = contentJson(await client.callTool({
      name: 'invariance_write_node',
      arguments: {
        run_id: 'run_1',
        action_type: 'tool_call',
        input: '{"prompt":"ship"}',
        output: '{"result":"ok"}',
      },
    }));
    expect(written).toMatchObject({ id: 'node_1', hash: 'hash_1' });

    expect(contentJson(await client.callTool({
      name: 'invariance_list_nodes',
      arguments: { run_id: 'run_1' },
    }))).toEqual({ data: [nodeFixture()], next_cursor: null });

    expect(contentJson(await client.callTool({
      name: 'invariance_verify_run',
      arguments: { id: 'run_1' },
    }))).toMatchObject({ run_id: 'run_1', valid: true, reason: null });

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /v1/runs',
      'GET /v1/runs/run_1',
      'GET /v1/runs',
      'POST /v1/nodes',
      'GET /v1/runs/run_1/nodes',
      'GET /v1/runs/run_1',
      'GET /v1/runs/run_1/verify',
    ]);
    expect(requests.find((request) => request.path === '/v1/nodes')?.body).toEqual([{
      run_id: 'run_1',
      action_type: 'tool_call',
      input: { prompt: 'ship' },
      output: { result: 'ok' },
    }]);
  });

  it('returns structured tool errors for bad JSON arguments', async () => {
    const result = await client.callTool({
      name: 'invariance_write_node',
      arguments: {
        run_id: 'run_1',
        action_type: 'tool_call',
        input: '{bad-json',
      },
    });

    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Invalid JSON in "input"');
    expect(requests.some((request) => request.path === '/v1/nodes')).toBe(false);
  });

  it('emits a signal via the new resource-grouped tool', async () => {
    const result = contentJson(await client.callTool({
      name: 'invariance_signal_emit',
      arguments: {
        severity: 'high',
        title: 'spike',
        message: 'p99 latency over budget',
        data: '{"p99_ms":2400}',
        run_id: 'run_1',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({ id: 'sig_1', severity: 'high', title: 'spike' });
    const signalRequest = requests.find((r) => r.method === 'POST' && r.path === '/v1/signals');
    expect(signalRequest?.body).toEqual({
      severity: 'high',
      title: 'spike',
      message: 'p99 latency over budget',
      data: { p99_ms: 2400 },
      run_id: 'run_1',
    });
  });

  it('returns the authenticated agent via invariance_agent_me', async () => {
    const result = contentJson(await client.callTool({
      name: 'invariance_agent_me',
      arguments: {},
    })) as { agent?: { id?: string } };
    expect(result.agent?.id).toBe('agent_1');
  });

  it('returns API errors as MCP tool errors without leaking stack traces', async () => {
    const result = await client.callTool({
      name: 'invariance_get_run',
      arguments: { id: 'missing' },
    });

    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Run missing not found');
    expect(contentText(result)).not.toContain('at ');
  });
});
