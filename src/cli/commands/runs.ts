import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, parseJson, type GlobalOpts, type TableColumn } from '../output.js';
import { withExamples } from '../help.js';

const runColumns: TableColumn[] = [
  { header: 'id', get: (r) => r.id },
  { header: 'name', get: (r) => r.name },
  { header: 'status', get: (r) => r.status },
  { header: 'created_at', get: (r) => r.created_at },
];

const nodeColumns: TableColumn[] = [
  { header: 'id', get: (n) => n.id },
  { header: 'action_type', get: (n) => n.action_type },
  { header: 'type', get: (n) => n.type },
  { header: 'timestamp', get: (n) => n.timestamp },
];

export function register(program: Command): void {
  const runs = program.command('runs').description('Manage runs (agent execution sessions)');

  withExamples(
    runs
      .command('start')
      .description('Start a new run')
      .option('--name <name>', 'Run name')
      .option('--metadata <json>', 'Metadata JSON object')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const run = await inv.runs.start({
          name: opts.name,
          metadata: parseJson('metadata', opts.metadata) as Record<string, unknown> | undefined,
        });
        print({ id: run.runId, name: run.name, status: run.status }, g);
      }),
    ['invariance runs start --name "research"'],
  );

  withExamples(
    runs
      .command('list')
      .description('List runs')
      .option('--limit <n>', 'Page size', parseInt)
      .option('--cursor <c>', 'Pagination cursor')
      .option('--all', 'Paginate through all pages')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        if (opts.all) {
          let cursor: string | undefined = undefined;
          const all: any[] = [];
          do {
            const page = await inv.runs.list({ cursor, limit: opts.limit });
            all.push(...page.data);
            cursor = page.next_cursor ?? undefined;
          } while (cursor);
          print(all, g, runColumns);
          return;
        }
        const page = await inv.runs.list({ cursor: opts.cursor, limit: opts.limit });
        print(page, g, runColumns);
      }),
    ['invariance runs list --limit 20', 'invariance runs list --all --output json'],
  );

  withExamples(
    runs
      .command('show <id>')
      .description('Show a run')
      .action(async (id: string) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const run = await inv.runs.get(id);
        print({ id: run.runId, name: run.name, status: run.status }, g);
      }),
    ['invariance runs show run_abc123'],
  );

  runs
    .command('update <id>')
    .description('Update run status or metadata')
    .option('--status <status>', 'open | completed | failed')
    .option('--metadata <json>', 'Metadata JSON object')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const body: Record<string, unknown> = {};
      if (opts.status) body.status = opts.status;
      if (opts.metadata) body.metadata = parseJson('metadata', opts.metadata);
      const res = await inv.http.patch(`/v1/runs/${id}`, body);
      print(res, g);
    });

  runs
    .command('cancel <id>')
    .description('Mark a run as failed')
    .option('--reason <text>', 'Failure reason')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const run = await inv.runs.get(id);
      const res = await run.fail(opts.reason);
      print(res, g);
    });

  runs
    .command('fork <id>')
    .description('Fork a run from a checkpoint node')
    .option('--from-node <node_id>', 'Node id to fork from')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const body: Record<string, unknown> = {};
      if (opts.fromNode) body.from_node_id = opts.fromNode;
      const res = await inv.http.post(`/v1/runs/${id}/fork`, body);
      print(res, g);
    });

  runs
    .command('metrics <id>')
    .description('Show aggregate metrics for a run (tokens, cost, latency)')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const res = await inv.http.get(`/v1/runs/${id}/metrics`);
      print(res, g);
    });

  withExamples(
    runs
      .command('verify <id>')
      .description('Verify the cryptographic proof chain for a run')
      .action(async (id: string) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const proof = await inv.proofs.verifyRun(id);
        print(proof, g);
      }),
    ['invariance runs verify run_abc123'],
  );

  runs
    .command('narrative <id>')
    .description('Fetch the LLM-generated narrative for a run')
    .option('--refresh', 'Force regeneration')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const narrative = await inv.narratives.get(id, { refresh: !!opts.refresh });
      print(narrative, g);
    });

  runs
    .command('llm-calls <id>')
    .description('List LLM calls in a run')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const params = new URLSearchParams();
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      const res = await inv.http.get(
        `/v1/runs/${id}/llm-calls${qs ? `?${qs}` : ''}`,
      );
      print(res, g);
    });

  runs
    .command('nodes <id>')
    .description('List nodes for a run (alias: `nodes list`)')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const page = await inv.nodes.list(id, { cursor: opts.cursor, limit: opts.limit });
      print(page, g, nodeColumns);
    });
}
