import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, type GlobalOpts } from '../output.js';

export function register(program: Command): void {
  const metrics = program.command('metrics').description('Aggregate metrics');

  metrics
    .command('overview')
    .description('Metrics overview across runs in a time window')
    .option('--from <iso>', 'ISO timestamp lower bound')
    .option('--to <iso>', 'ISO timestamp upper bound')
    .option('--project-id <id>', 'Scope to project')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      const params = new URLSearchParams();
      if (opts.from) params.set('from', opts.from);
      if (opts.to) params.set('to', opts.to);
      if (opts.projectId) params.set('project_id', opts.projectId);
      const qs = params.toString();
      const res = await inv.http.get<unknown>(`/v1/metrics/overview${qs ? `?${qs}` : ''}`);
      print(res, g);
    });
}
