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
    if (method === 'DELETE' && url.pathname === '/v1/monitors/mon_1') {
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH' && url.pathname.startsWith('/v1/runs/')) {
      return jsonResponse({ run: { ...runFixture(), status: 'completed' } });
    }
    if (method === 'GET' && url.pathname === '/v1/findings') {
      return jsonResponse({ data: [], next_cursor: null });
    }
    if (method === 'POST' && url.pathname === '/v1/monitors/mon_1/evaluate') {
      return jsonResponse({
        execution: { id: 'exec_1', status: 'passed' },
        signals: [],
        findings: [],
        reviews: [],
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
  it('lists the MVP run, node, and proof tools', async () => {
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      'invariance_create_run',
      'invariance_delete_monitor',
      'invariance_eval_list_cases',
      'invariance_eval_run_case',
      'invariance_eval_summarize',
      'invariance_get_run',
      'invariance_list_nodes',
      'invariance_list_runs',
      'invariance_verify_run',
      'invariance_write_node',
    ]);
  });

  it('invariance_eval_run_case stamps metadata.eval and returns pass when no findings', async () => {
    const result = contentJson(await client.callTool({
      name: 'invariance_eval_run_case',
      arguments: {
        suite: 'regression-v1',
        case: 'happy',
        monitor_ids: ['mon_1'],
        input_text: 'hello',
      },
    })) as { run_id: string; suite: string; case: string; status: string };

    expect(result.suite).toBe('regression-v1');
    expect(result.case).toBe('happy');
    expect(result.status).toBe('pass');

    const startReq = requests.find((r) => r.method === 'POST' && r.path === '/v1/runs');
    expect(startReq).toBeDefined();
    const startBody = startReq!.body as { metadata: { eval: { suite: string; case: string } } };
    expect(startBody.metadata.eval.suite).toBe('regression-v1');
    expect(startBody.metadata.eval.case).toBe('happy');
    expect(requests.some((r) => r.path === '/v1/monitors/mon_1/evaluate')).toBe(true);
  });

  it('invariance_eval_summarize aggregates pass/fail counts', async () => {
    const result = contentJson(await client.callTool({
      name: 'invariance_eval_summarize',
      arguments: { suite: 'empty-suite' },
    }));
    expect(result).toEqual({ suite: 'empty-suite', total: 0, passed: 0, failed: 0 });
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

  it('invariance_delete_monitor sends DELETE and reports the deletion', async () => {
    const result = contentJson(await client.callTool({
      name: 'invariance_delete_monitor',
      arguments: { id: 'mon_1' },
    }));
    expect(result).toEqual({ id: 'mon_1', deleted: true });
    expect(requests.find((r) => r.path === '/v1/monitors/mon_1')).toMatchObject({
      method: 'DELETE',
    });
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
