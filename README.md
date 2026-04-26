# Invariance TypeScript SDK

Official TypeScript SDK for the [Invariance AI](https://invariance.ai) platform. Start runs, emit nodes, verify proofs, and drive monitors/signals/reviews from any TypeScript or Node.js agent stack.

Part of the Invariance SDK family:

- [`@invariance/sdk`](./) — TypeScript SDK (this repo).
- [`invariance-sdk` (Python)](../invariance-python) — Python SDK.
- [`@invariance/cli`](../invariance-cli) — command-line interface.

## Install

Published releases are on npm:

```bash
npm install @invariance/sdk
# or
pnpm add @invariance/sdk
```

Requires Node.js >= 20.

## Quickstart

```ts
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY!,
});

await inv.runs.start({ name: 'refund-flow' }, async (run) => {
  await run.context({ userId, workspaceId, riskTier: 'medium' });
  await run.log('prompt received', { prompt: rawPrompt });

  const policy = await run.tool('policy_lookup', { orderId }, async () => {
    return lookupPolicy(orderId);
  });

  await run.log('decision', { reason: 'customer eligible', policy });
});
```

The callback form auto-finishes the run on success and marks it failed on throw. `run.step(...)` is the general primitive; `run.log`, `run.context`, and `run.tool` are thin helpers that emit nodes over it.

## Lifecycle

The SDK is run-first:

1. Initialize the client.
2. Start a run.
3. Record work as **nodes** (the atomic unit written to `/v1/trace/events`).
4. Finish the run.
5. Optionally verify the proof chain with `run.verify()`.

## API surface

| Resource | Purpose |
| --- | --- |
| `inv.runs` | Start, list, get, verify runs. |
| `inv.nodes` | Write nodes (trace events) and list them by run. |
| `inv.monitors` | Create, update, and evaluate simple monitors. |
| `inv.signals` | List and acknowledge monitor-emitted signals. |
| `inv.findings` | Investigation records produced from signals. |
| `inv.reviews` | Claim, unclaim, and resolve reviews. |
| `inv.agents` | Identity + key registration. |
| `inv.proofs` | Proof chain verification. |
| `inv.narratives` | LLM-generated run summaries. |

## Configuration

Resolved in priority order:

1. Explicit `Invariance.init({ apiKey, apiUrl })` options.
2. Env vars: `INVARIANCE_API_KEY`, `INVARIANCE_API_URL`.
3. Built-in defaults (`DEFAULT_API_URL`).

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT. See [LICENSE](./LICENSE).
