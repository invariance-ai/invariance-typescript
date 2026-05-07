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

// Attach business identifiers at runs.start so traces are queryable
// by customer / ticket / refund — whatever you operate on.
await inv.runs.start(
  {
    name: 'refund-flow',
    metadata: { customerId: 'c_123', ticketId: 't_456', refundId: 'rf_789' },
  },
  async (run) => {
    await run.context({ userId, workspaceId, riskTier: 'medium' });

    // Tool call: action_type is the tool name; output + duration + thrown
    // errors are captured automatically and surfaced on the node.
    const refund = await run.tool(
      'stripe.refunds.create',
      { orderId },
      async () => stripeRefund(orderId),
    );

    await run.log('decision', { status: 'completed', refundId: refund.id });
  },
);
```

The callback form auto-finishes the run on success and marks it failed on throw — the thrown error is recorded on the failing node and `run.error_count` increments. Use `run.fail(msg)` to mark a run failed without raising. `run.step(...)` is the general primitive; `run.log`, `run.context`, and `run.tool` are thin helpers that emit nodes over it.

After the run, inspect it from any terminal — handy for coding agents debugging a failure:

```bash
inv runs inspect <run_id> --json   # full run + nodes
inv nodes tail <run_id>            # stream nodes as they arrive
```

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
| `inv.kb` | Knowledge base — `pages.{create,list,get,update,delete}`, `sessions.{create,list,get,delete,listMessages,appendMessage}`. |
| `inv.ask` | Server-side agent loop with KB + run-context tools (`/v1/ask`). |

### Intelligence: KB + Ask

```ts
const inv = Invariance.init({ apiKey: process.env.INVARIANCE_API_KEY! });

await inv.kb.pages.create({
  path: 'wiki:auth-flow',
  title: 'Auth flow',
  body: 'Tokens are minted on /v1/auth/cli-token …',
});

const reply = await inv.ask.send({ message: 'How does our auth flow work?' });
console.log(reply.final_text); // cites [[wiki:auth-flow]] and [run:r_…]
```

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
