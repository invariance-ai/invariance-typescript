#!/usr/bin/env node
import { Command } from 'commander';
import { Invariance } from '../index.js';
import { DEFAULT_API_URL } from '../config.js';

function getClient(opts: { apiKey?: string; apiUrl?: string }): Invariance {
  const apiKey = opts.apiKey ?? process.env.INVARIANCE_API_KEY;
  if (!apiKey) {
    console.error('Error: API key required. Use --api-key or set INVARIANCE_API_KEY.');
    process.exit(1);
  }
  return Invariance.init({
    apiKey,
    apiUrl: opts.apiUrl ?? process.env.INVARIANCE_API_URL ?? DEFAULT_API_URL,
  });
}

function parseJsonFlag(name: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    console.error(`Error: invalid JSON in --${name}: ${(err as Error).message}`);
    process.exit(1);
  }
}

function output(data: unknown, _json: boolean) {
  console.log(JSON.stringify(data, null, 2));
}

const program = new Command();
program.name('invariance').description('Invariance CLI').version('0.0.0');

// Global options
program.option('--api-key <key>', 'API key');
program.option('--api-url <url>', 'API base URL');
program.option('--json', 'JSON output', false);

// ── Runs ────────────────────────────────────────────────────────────────────

const runs = program.command('runs').description('Manage runs');

runs
  .command('start')
  .description('Start a new run')
  .option('--name <name>', 'Run name')
  .action(async (opts) => {
    const inv = getClient(program.opts());
    const run = await inv.runs.start({ name: opts.name });
    output({ id: run.sessionId, name: run.name, status: run.status }, program.opts().json);
  });

runs
  .command('list')
  .description('List runs')
  .action(async () => {
    const inv = getClient(program.opts());
    const result = await inv.runs.list();
    output(result, program.opts().json);
  });

runs
  .command('show <id>')
  .description('Show a run')
  .action(async (id: string) => {
    const inv = getClient(program.opts());
    const run = await inv.runs.get(id);
    output({ id: run.sessionId, name: run.name, status: run.status }, program.opts().json);
  });

runs
  .command('verify <id>')
  .description('Verify run proof chain')
  .action(async (id: string) => {
    const inv = getClient(program.opts());
    const run = await inv.runs.get(id);
    const proof = await run.verify();
    output(proof, program.opts().json);
  });

// ── Nodes ───────────────────────────────────────────────────────────────────

const nodes = program.command('nodes').description('Manage nodes');

nodes
  .command('write <session_id>')
  .description('Write a node')
  .requiredOption('--action-type <type>', 'Action type')
  .option('--input <json>', 'Input JSON')
  .option('--output <json>', 'Output JSON')
  .action(async (sessionId: string, opts) => {
    const inv = getClient(program.opts());
    const result = await inv.nodes.write(sessionId, [{
      action_type: opts.actionType,
      input: parseJsonFlag('input', opts.input),
      output: parseJsonFlag('output', opts.output),
    }]);
    output(result, program.opts().json);
  });

nodes
  .command('list <session_id>')
  .description('List nodes for a session')
  .action(async (sessionId: string) => {
    const inv = getClient(program.opts());
    const result = await inv.nodes.list(sessionId);
    output(result, program.opts().json);
  });

program.parseAsync().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
