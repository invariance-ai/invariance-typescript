import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, type GlobalOpts } from '../output.js';

export function register(program: Command): void {
  const trace = program.command('trace').description('Realtime trace utilities');

  trace
    .command('tail <run_id>')
    .description('Poll a run for new nodes and stream them')
    .option('--interval <ms>', 'Poll interval in ms', (v) => parseInt(v, 10), 2000)
    .option('--limit <n>', 'Max nodes per poll', parseInt)
    .action(async (runId: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      let cursor: string | undefined = undefined;
      let stopped = false;
      process.on('SIGINT', () => {
        stopped = true;
      });
      while (!stopped) {
        const page = await inv.nodes.list(runId, { cursor, limit: opts.limit });
        for (const n of page.data) {
          print(n, g);
        }
        if (page.next_cursor) {
          cursor = page.next_cursor;
          continue;
        }
        await new Promise((r) => setTimeout(r, opts.interval));
      }
    });
}
