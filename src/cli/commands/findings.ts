import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, type GlobalOpts, type TableColumn } from '../output.js';
import type { FindingStatus } from '../../resources/findings.js';

const cols: TableColumn[] = [
  { header: 'id', get: (f) => f.id },
  { header: 'severity', get: (f) => f.severity },
  { header: 'title', get: (f) => f.title },
  { header: 'status', get: (f) => f.status },
  { header: 'created_at', get: (f) => f.created_at },
];

export function register(program: Command): void {
  const findings = program.command('findings').description('Manage findings (investigation records)');

  findings
    .command('list')
    .description('List findings')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.findings.list({ cursor: opts.cursor, limit: opts.limit }), g, cols);
    });

  findings
    .command('show <id>')
    .description('Show a finding')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.findings.get(id), g);
    });

  findings
    .command('update <id>')
    .description('Update finding status')
    .requiredOption('--status <s>', 'open|review_requested|resolved|dismissed')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.findings.update(id, { status: opts.status as FindingStatus }), g);
    });
}
