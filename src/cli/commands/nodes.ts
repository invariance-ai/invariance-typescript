import { promises as fs } from 'node:fs';
import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, parseJson, type GlobalOpts } from '../output.js';
import { withExamples } from '../help.js';
import type { WriteNodeInput } from '../../resources/nodes.js';

export function register(program: Command): void {
  const nodes = program.command('nodes').description('Manage nodes (execution trace events)');

  withExamples(
    nodes
      .command('write <run_id>')
      .description('Write one or more nodes to a run')
      .option('--action-type <type>', 'Action type (required unless --file)')
      .option('--type <type>', 'Declared node type')
      .option('--input <json>', 'Input JSON')
      .option('--output <json>', 'Output JSON')
      .option('--error <json>', 'Error JSON')
      .option('--metadata <json>', 'Metadata JSON')
      .option('--file <path>', 'JSONL file with one node per line (batches of 100)')
      .action(async (runId: string, opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        let events: WriteNodeInput[];
        if (opts.file) {
          const raw = await fs.readFile(opts.file, 'utf8');
          events = raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l, i) => {
              try {
                return JSON.parse(l) as WriteNodeInput;
              } catch {
                throw new Error(`Invalid JSON on line ${i + 1} of ${opts.file}`);
              }
            });
        } else {
          if (!opts.actionType) throw new Error('--action-type is required when --file is not provided');
          events = [
            {
              action_type: opts.actionType,
              type: opts.type,
              input: parseJson('input', opts.input),
              output: parseJson('output', opts.output),
              error: parseJson('error', opts.error),
              metadata: parseJson('metadata', opts.metadata) as Record<string, unknown> | undefined,
            },
          ];
        }
        const results = [];
        for (let i = 0; i < events.length; i += 100) {
          results.push(...(await inv.nodes.write(runId, events.slice(i, i + 100))));
        }
        print(results, g);
      }),
    [
      'invariance nodes write run_abc --action-type tool_call --input \'{"x":1}\'',
      'invariance nodes write run_abc --file trace.jsonl',
    ],
  );

  nodes
    .command('list <run_id>')
    .description('List nodes for a run')
    .option('--limit <n>', 'Page size', parseInt)
    .option('--cursor <c>', 'Pagination cursor')
    .action(async (runId: string, opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const page = await inv.nodes.list(runId, { cursor: opts.cursor, limit: opts.limit });
      print(page, g);
    });
}
