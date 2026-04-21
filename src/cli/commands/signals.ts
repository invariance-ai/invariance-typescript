import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, parseJson, type GlobalOpts, type TableColumn } from '../output.js';
import { withExamples } from '../help.js';
import type { Severity } from '../../resources/monitors.js';

const signalColumns: TableColumn[] = [
  { header: 'id', get: (s) => s.id },
  { header: 'severity', get: (s) => s.severity },
  { header: 'title', get: (s) => s.title },
  { header: 'status', get: (s) => s.status },
  { header: 'source', get: (s) => s.source },
  { header: 'created_at', get: (s) => s.created_at },
];

export function register(program: Command): void {
  const signals = program.command('signals').description('Manage signals (alerts)');

  withExamples(
    signals
      .command('emit')
      .description('Emit a signal manually')
      .requiredOption('--severity <s>', 'info|low|medium|high|critical')
      .requiredOption('--title <text>', 'Signal title')
      .option('--message <text>', 'Message body')
      .option('--type <t>', 'Signal type key')
      .option('--run-id <id>', 'Attach to run')
      .option('--node-id <id>', 'Attach to node')
      .option('--data <json>', 'Structured data payload')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const res = await inv.signals.emit({
          severity: opts.severity as Severity,
          title: opts.title,
          message: opts.message,
          type: opts.type,
          run_id: opts.runId,
          node_id: opts.nodeId,
          data: parseJson('data', opts.data),
        });
        print(res, g);
      }),
    ['invariance signals emit --severity high --title "anomaly" --run-id run_abc'],
  );

  signals
    .command('list')
    .description('List signals')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.signals.list({ cursor: opts.cursor, limit: opts.limit }), g, signalColumns);
    });

  signals
    .command('show <id>')
    .description('Show a signal')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.signals.get(id), g);
    });

  signals
    .command('ack <id>')
    .description('Acknowledge a signal')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.signals.acknowledge(id), g);
    });

  signals
    .command('resolve <id>')
    .description('Resolve a signal')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.signals.resolve(id), g);
    });
}
