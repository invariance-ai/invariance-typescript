import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY!,
});

await inv.runs.start({ name: 'hello-invariance' }, async (run) => {
  await run.context({ user: 'demo' });
  await run.log('prompt received', { prompt: 'Hello, world?' });

  await run.tool('greet', { who: 'world' }, async () => {
    return { greeting: 'Hello, world!' };
  });

  await run.log('done', { ok: true });
});

console.log('run finished — check the dashboard');
