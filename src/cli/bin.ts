#!/usr/bin/env node
import { Command } from 'commander';
import { handleError } from './output.js';
import { register as registerRuns } from './commands/runs.js';
import { register as registerNodes } from './commands/nodes.js';
import { register as registerMonitors } from './commands/monitors.js';
import { register as registerSignals } from './commands/signals.js';
import { register as registerFindings } from './commands/findings.js';
import { register as registerReviews } from './commands/reviews.js';
import { register as registerAgents } from './commands/agents.js';
import { register as registerMetrics } from './commands/metrics.js';
import { register as registerTrace } from './commands/trace.js';
import { register as registerAuth } from './commands/auth.js';
import { register as registerDocs } from './commands/docs.js';

const program = new Command();

program
  .name('invariance')
  .description(
    'Invariance CLI — control runs, nodes, monitors, signals, findings, reviews, and agents.\n' +
      'Run `invariance docs quickstart` for a 5-step walkthrough.',
  )
  .version('0.1.0');

program.option('--api-key <key>', 'API key (or INVARIANCE_API_KEY)');
program.option('--api-url <url>', 'API base URL (or INVARIANCE_API_URL)');
program.option('--profile <name>', 'Credentials profile name');
program.option('--output <format>', 'json | table | yaml');
program.option('--json', 'Alias for --output json', false);
program.option('--quiet', 'Suppress non-essential output', false);
program.option('--no-color', 'Disable ANSI color');

registerAuth(program);
registerRuns(program);
registerNodes(program);
registerMonitors(program);
registerSignals(program);
registerFindings(program);
registerReviews(program);
registerAgents(program);
registerMetrics(program);
registerTrace(program);
registerDocs(program);

program.addHelpText(
  'after',
  `\nGetting started:
  $ invariance auth login
  $ invariance docs quickstart

Credential precedence: --api-key > INVARIANCE_API_KEY > ~/.invariance/credentials.json
`,
);

program.parseAsync().catch((err) => handleError(err));
