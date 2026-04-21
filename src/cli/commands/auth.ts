import type { Command } from 'commander';
import { Invariance } from '../../index.js';
import { DEFAULT_API_URL } from '../../config.js';
import {
  credentialsPath,
  listProfiles,
  loadProfile,
  promptSecret,
  removeProfile,
  saveProfile,
} from '../auth.js';
import { print, fail, handleError, type GlobalOpts } from '../output.js';
import { withExamples } from '../help.js';

export function register(program: Command): void {
  const auth = program.command('auth').description('Manage API credentials');

  withExamples(
    auth
      .command('login')
      .description('Store an API key in the credentials file')
      .option('--profile <name>', 'Profile name', 'default')
      .option('--api-url <url>', 'API base URL')
      .option('--api-key <key>', 'API key (if omitted, you will be prompted)')
      .option('--signing-key <hex>', 'Ed25519 private key (optional)')
      .action(async (opts) => {
        const apiKey = opts.apiKey ?? (await promptSecret('API key: '));
        if (!apiKey) fail('API key required');
        const apiUrl = opts.apiUrl ?? DEFAULT_API_URL;
        try {
          const inv = Invariance.init({ apiKey, apiUrl });
          const me = await inv.agents.me();
          await saveProfile(
            opts.profile,
            { apiKey, apiUrl, signingKey: opts.signingKey },
            true,
          );
          process.stdout.write(
            `Saved profile "${opts.profile}" (agent: ${me.agent.id}, key: ${me.api_key?.prefix ?? 'n/a'}_***)\n`,
          );
          process.stdout.write(`Credentials: ${credentialsPath()}\n`);
        } catch (err) {
          handleError(err);
        }
      }),
    ['invariance auth login', 'invariance auth login --profile staging --api-url https://staging.api'],
  );

  auth
    .command('logout')
    .description('Remove a profile')
    .option('--profile <name>', 'Profile name', 'default')
    .action(async (opts) => {
      const removed = await removeProfile(opts.profile);
      if (!removed) fail(`No profile named "${opts.profile}"`);
      process.stdout.write(`Removed profile "${opts.profile}"\n`);
    });

  auth
    .command('whoami')
    .description('Show the authenticated agent')
    .action(async () => {
      const g = program.opts() as GlobalOpts;
      try {
        const { getClient } = await import('../client-factory.js');
        const inv = await getClient(g);
        const me = await inv.agents.me();
        print(me, g);
      } catch (err) {
        handleError(err);
      }
    });

  auth
    .command('status')
    .description('Show active profile and credential source')
    .action(async () => {
      const g = program.opts() as GlobalOpts;
      const profile = await loadProfile({
        flagApiKey: g.apiKey,
        flagApiUrl: g.apiUrl,
        profile: g.profile,
      });
      const profiles = await listProfiles();
      print(
        {
          source: profile.source,
          profile: profile.profileName,
          apiUrl: profile.apiUrl,
          signingKey: profile.signingKey ? 'configured' : 'not configured',
          credentialsPath: credentialsPath(),
          allProfiles: profiles,
        },
        g,
      );
    });

  auth
    .command('list')
    .description('List stored profiles')
    .action(async () => {
      const g = program.opts() as GlobalOpts;
      print(await listProfiles(), g);
    });
}
