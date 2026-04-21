import { promises as fs } from 'node:fs';
import type { Command } from 'commander';
import { getClient } from '../client-factory.js';
import { print, type GlobalOpts, type TableColumn } from '../output.js';
import { withExamples } from '../help.js';
import { generateKeypair } from '../../crypto.js';

const cols: TableColumn[] = [
  { header: 'id', get: (a) => a.id },
  { header: 'name', get: (a) => a.name },
  { header: 'project_id', get: (a) => a.project_id },
  { header: 'has_key', get: (a) => !!a.public_key },
  { header: 'created_at', get: (a) => a.created_at },
];

export function register(program: Command): void {
  const agents = program.command('agents').description('Manage agents');

  withExamples(
    agents
      .command('create')
      .description('Create an agent in a project (requires user JWT)')
      .requiredOption('--project-id <id>', 'Project id')
      .requiredOption('--name <name>', 'Agent name')
      .option('--public-key <hex>', 'Ed25519 public key (hex)')
      .option('--key-mode <mode>', 'test|live', 'test')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const res = await inv.agents.create({
          name: opts.name,
          project_id: opts.projectId,
          public_key: opts.publicKey,
          key_mode: opts.keyMode,
        });
        print(res, g);
      }),
    ['invariance agents create --project-id proj_abc --name "planner"'],
  );

  agents
    .command('list')
    .description('List agents in a project')
    .requiredOption('--project-id <id>', 'Project id')
    .action(async (opts) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.agents.list({ project_id: opts.projectId }), g, cols);
    });

  agents
    .command('show <id>')
    .description('Show agent details')
    .action(async (id: string) => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.agents.get(id), g);
    });

  agents
    .command('me')
    .description('Show the caller agent + API key info')
    .action(async () => {
      const g = program.opts() as GlobalOpts;
      const inv = await getClient(g);
      print(await inv.agents.me(), g);
    });

  withExamples(
    agents
      .command('rotate-key')
      .description('Generate a new Ed25519 keypair and register the public key')
      .option('--out <path>', 'Write private key hex to this file (chmod 600)')
      .action(async (opts) => {
        const g = program.opts() as GlobalOpts;
        const inv = await getClient(g);
        const kp = generateKeypair();
        const publicKey = kp.publicKey;
        const agent = await inv.agents.setPublicKey(publicKey);
        if (opts.out) {
          await fs.writeFile(opts.out, kp.privateKey, { mode: 0o600 });
          print({ agent, private_key_file: opts.out, public_key: publicKey }, g);
        } else {
          print(
            {
              agent,
              private_key: kp.privateKey,
              public_key: publicKey,
              warning: 'Store private_key securely — it will not be shown again.',
            },
            g,
          );
        }
      }),
    ['invariance agents rotate-key --out ~/.invariance/signing.key'],
  );
}
