import { promises as fs } from 'node:fs';
import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, parseJson, fail, type GlobalOpts, type TableColumn } from '../output.js';
import { withExamples } from '../help.js';
import type { CreateMonitorRequest, UpdateMonitorRequest } from '../../resources/monitors.js';

const monitorColumns: TableColumn[] = [
  { header: 'id', get: (m) => m.id },
  { header: 'name', get: (m) => m.name },
  { header: 'enabled', get: (m) => m.enabled },
  { header: 'severity', get: (m) => m.severity },
  { header: 'schedule', get: (m) => m.schedule?.kind },
];

export function register(program: Command): void {
  const monitors = program.command('monitors').description('Manage monitors (evaluation rules)');

  withExamples(
    monitors
      .command('create')
      .description('Create a monitor')
      .option('--file <path>', 'JSON file with CreateMonitorRequest body')
      .option('--spec <json>', 'Inline JSON request body')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        let body: CreateMonitorRequest;
        if (opts.file) {
          body = JSON.parse(await fs.readFile(opts.file, 'utf8'));
        } else if (opts.spec) {
          body = parseJson('spec', opts.spec) as CreateMonitorRequest;
        } else {
          fail('Provide --file or --spec');
        }
        const res = await inv.http.post<{ monitor: unknown }>('/v1/monitors', body!);
        print(res, g);
      }),
    ['invariance monitors create --file monitor.json'],
  );

  monitors
    .command('list')
    .description('List monitors')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const page = await inv.monitors.list({ cursor: opts.cursor, limit: opts.limit });
      print(page, g, monitorColumns);
    });

  monitors
    .command('show <id>')
    .description('Show a monitor')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.monitors.get(id), g);
    });

  monitors
    .command('update <id>')
    .description('Update a monitor')
    .option('--file <path>', 'JSON file with UpdateMonitorRequest body')
    .option('--patch <json>', 'Inline JSON patch body')
    .option('--enabled <bool>', 'Enable/disable (true|false)')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      let body: UpdateMonitorRequest;
      if (opts.file) {
        body = JSON.parse(await fs.readFile(opts.file, 'utf8'));
      } else if (opts.patch) {
        body = parseJson('patch', opts.patch) as UpdateMonitorRequest;
      } else {
        body = {};
      }
      if (opts.enabled !== undefined) body.enabled = opts.enabled === 'true';
      print(await inv.monitors.update(id, body), g);
    });

  monitors
    .command('pause <id>')
    .description('Disable a monitor')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.monitors.pause(id), g);
    });

  monitors
    .command('resume <id>')
    .description('Enable a monitor')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.monitors.resume(id), g);
    });

  withExamples(
    monitors
      .command('evaluate <id>')
      .description('Manually trigger evaluation of a monitor')
      .option('--run-id <run>', 'Scope evaluation to a run')
      .option('--since <iso>', 'ISO timestamp lower bound')
      .option('--limit <n>', 'Max nodes to scan', parseInt)
      .action(async (id: string, opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const res = await inv.monitors.evaluate(id, {
          run_id: opts.runId,
          since: opts.since,
          limit: opts.limit,
        });
        print(res, g);
      }),
    ['invariance monitors evaluate mon_abc --run-id run_xyz'],
  );

  monitors
    .command('executions <id>')
    .description('List executions for a monitor')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.monitors.executions(id, { cursor: opts.cursor, limit: opts.limit }), g);
    });

  monitors
    .command('findings <id>')
    .description('List findings produced by a monitor')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.monitors.findings(id, { cursor: opts.cursor, limit: opts.limit }), g);
    });
}
