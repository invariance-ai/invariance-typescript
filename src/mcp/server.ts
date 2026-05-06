import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Invariance } from '../index.js';
import { DEFAULT_API_URL } from '../config.js';

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

function parseJsonArg(name: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid JSON in "${name}": ${(err as Error).message}`);
  }
}

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
    name: 'invariance',
    version: pkg.version,
  });

  // ── Create Run ──────────────────────────────────────────────────

  server.tool(
    'invariance_create_run',
    'Start a new Invariance run',
    { name: z.string().optional().describe('Run name') },
    async ({ name }) => {
      const run = await inv.runs.start({ name });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id: run.runId, name: run.name, status: run.status }),
        }],
      };
    },
  );

  // ── Get Run ─────────────────────────────────────────────────────

  server.tool(
    'invariance_get_run',
    'Get details of an Invariance run',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id: run.runId, name: run.name, status: run.status }),
        }],
      };
    },
  );

  // ── List Runs ───────────────────────────────────────────────────

  server.tool(
    'invariance_list_runs',
    'List Invariance runs',
    {},
    async () => {
      const result = await inv.runs.list();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result),
        }],
      };
    },
  );

  // ── Write Node ──────────────────────────────────────────────────

  server.tool(
    'invariance_write_node',
    'Write a node to an Invariance run',
    {
      run_id: z.string().describe('Run ID'),
      action_type: z.string().describe('Action type (e.g. tool_call, llm_call)'),
      input: z.string().optional().describe('Input JSON string'),
      output: z.string().optional().describe('Output JSON string'),
    },
    async ({ run_id, action_type, input, output }) => {
      const nodes = await inv.nodes.write(run_id, [{
        action_type,
        input: parseJsonArg('input', input),
        output: parseJsonArg('output', output),
      }]);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(nodes[0]),
        }],
      };
    },
  );

  // ── List Nodes ──────────────────────────────────────────────────

  server.tool(
    'invariance_list_nodes',
    'List nodes for an Invariance run',
    { run_id: z.string().describe('Run ID') },
    async ({ run_id }) => {
      const result = await inv.nodes.list(run_id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result),
        }],
      };
    },
  );

  // ── Delete Monitor ──────────────────────────────────────────────

  server.tool(
    'invariance_delete_monitor',
    'Soft-delete (archive) a monitor. Existing findings, signals, and reviews remain queryable; the monitor stops evaluating.',
    { id: z.string().describe('Monitor ID') },
    async ({ id }) => {
      await inv.monitors.delete(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id, deleted: true }),
        }],
      };
    },
  );

  // ── Evals: Run Case ─────────────────────────────────────────────

  server.tool(
    'invariance_eval_run_case',
    'Run an eval case as an Invariance run. Stamps metadata.eval, evaluates monitors, returns pass/fail.',
    {
      suite: z.string().describe('Eval suite name (groups runs in the dashboard)'),
      case: z.string().describe('Test case name within the suite'),
      expected: z.string().optional().describe('Expected output / assertion descriptor as JSON string'),
      inputs: z.string().optional().describe('Input snapshot as JSON string (for repeatability)'),
      monitor_ids: z.array(z.string()).optional().describe('Monitor IDs to evaluate after the run'),
      input_text: z.string().optional().describe('Plain text input recorded as the first node'),
    },
    async ({ suite, case: caseName, expected, inputs, monitor_ids, input_text }) => {
      const result = await inv.evals.runCase({
        suite,
        case: caseName,
        expected: parseJsonArg('expected', expected),
        inputs: parseJsonArg('inputs', inputs),
        monitorIds: monitor_ids,
        handler: async (run) => {
          if (input_text !== undefined) {
            await run.log('eval_input', { text: input_text });
          }
        },
      });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            run_id: result.run_id,
            suite: result.suite,
            case: result.case,
            status: result.status,
            findings: result.findings.map((f) => ({
              id: f.id,
              severity: f.severity,
              title: f.title,
              status: f.status,
            })),
          }),
        }],
      };
    },
  );

  // ── Evals: List Cases ───────────────────────────────────────────

  server.tool(
    'invariance_eval_list_cases',
    'List eval-case runs for a suite with derived pass/fail status.',
    {
      suite: z.string().describe('Suite name'),
      limit: z.number().int().positive().max(200).optional(),
      cursor: z.string().optional(),
    },
    async ({ suite, limit, cursor }) => {
      const res = await inv.evals.listCases({ suite, limit, cursor });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res) }],
      };
    },
  );

  // ── Evals: Summarize ────────────────────────────────────────────

  server.tool(
    'invariance_eval_summarize',
    'Aggregate pass/fail counts across all runs tagged with the given eval suite.',
    { suite: z.string().describe('Suite name') },
    async ({ suite }) => {
      const res = await inv.evals.summarize(suite);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(res) }],
      };
    },
  );

  // ── Verify Run ──────────────────────────────────────────────────

  server.tool(
    'invariance_verify_run',
    'Verify the proof chain for an Invariance run',
    { id: z.string().describe('Run ID') },
    async ({ id }) => {
      const run = await inv.runs.get(id);
      const proof = await run.verify();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(proof),
        }],
      };
    },
  );

  return server;
}

export async function main() {
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
