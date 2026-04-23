# Invariance TypeScript SDK

Clean MVP TypeScript SDK.

This repository should expose only the customer loop:

- initialize client
- start and finish a run
- emit trace events
- create and evaluate simple monitors
- list signals
- list, claim, and resolve reviews

## Lifecycle

The SDK is run-first. Start a run, record work, finish the run.

```ts
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init();

await inv.runs.start({ name: 'refund-flow' }, async (run) => {
  await run.context({ userId, workspaceId, riskTier: 'medium' });
  await run.log('prompt received', { prompt: rawPrompt });

  const policy = await run.tool('policy_lookup', { orderId }, async () => {
    return await lookupPolicy(orderId);
  });

  await run.log('decision', { reason: 'customer eligible', policy });
});
```

The callback form auto-finishes on success and marks the run failed on throw.
`run.step(...)` remains available as the general primitive; `run.log`,
`run.context`, and `run.tool` are thin helpers over it.

Legacy SDK reference:

```text
../_archive/invariance-sdk-legacy/packages/typescript
```
