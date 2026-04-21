import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, type GlobalOpts, type TableColumn } from '../output.js';
import { withExamples } from '../help.js';
import type { ReviewDecision } from '../../resources/reviews.js';

const cols: TableColumn[] = [
  { header: 'id', get: (r) => r.id },
  { header: 'finding_id', get: (r) => r.finding_id },
  { header: 'status', get: (r) => r.status },
  { header: 'decision', get: (r) => r.decision },
  { header: 'reviewer', get: (r) => r.reviewer_agent_id },
];

export function register(program: Command): void {
  const reviews = program.command('reviews').description('Manage reviews (resolution workflow)');

  reviews
    .command('list')
    .description('List reviews')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.reviews.list({ cursor: opts.cursor, limit: opts.limit }), g, cols);
    });

  reviews
    .command('show <id>')
    .description('Show a review')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.reviews.get(id), g);
    });

  reviews
    .command('claim <id>')
    .description('Claim a review')
    .option('--notes <text>', 'Optional notes')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.reviews.claim(id, { notes: opts.notes }), g);
    });

  reviews
    .command('unclaim <id>')
    .description('Release a claimed review')
    .option('--notes <text>', 'Optional notes')
    .action(async (id: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.reviews.unclaim(id, { notes: opts.notes }), g);
    });

  withExamples(
    reviews
      .command('resolve <id>')
      .description('Resolve a review with a decision')
      .requiredOption('--decision <d>', 'passed|failed|needs_fix')
      .option('--notes <text>', 'Reviewer notes')
      .action(async (id: string, opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        print(
          await inv.reviews.resolve(id, {
            decision: opts.decision as ReviewDecision,
            notes: opts.notes,
          }),
          g,
        );
      }),
    ['invariance reviews resolve rev_abc --decision passed --notes "verified"'],
  );
}
