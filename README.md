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

## Multi-agent

Each `Invariance.init({ apiKey })` is bound to a single agent — the server reads `agent_id` from the API key on every node. To trace a multi-agent system, give each agent its own key (`inv.agents.create(...)` or the dashboard) and one `Invariance` instance per process/agent.

A delegation between agents is recorded as a **handoff node**. The sender emits one with `run.handoff()`; the receiver opens its own run and links back via `parentHandoffToken`:

```ts
// ── sender (agent: planner) ────────────────────────────────────────
const planner = Invariance.init({
  apiKey: process.env.PLANNER_API_KEY!,
  signingKey: process.env.PLANNER_SIGNING_KEY, // required to mint a token
});

let handoffToken: string | undefined;

await planner.runs.start({ name: 'plan-and-execute' }, async (run) => {
  await run.log('plan ready', { steps });

  const token = await run.handoff({
    toAgentId: 'executor',
    reason: 'specialist required',
    message: { steps },
  });
  handoffToken = token?.encode(); // null if signingKey is unset
});

// ── receiver (agent: executor) ─────────────────────────────────────
const executor = Invariance.init({ apiKey: process.env.EXECUTOR_API_KEY! });

await executor.runs.start(
  { name: 'execute-plan', parentHandoffToken: handoffToken },
  async (run) => {
    await run.log('executing', { steps });
    // …
  },
);
```

What the platform does with this:

- The handoff node carries `handoff_from` / `handoff_to` / `handoff_reason`. The dashboard renders it as a boundary between swimlanes.
- `parentHandoffToken` populates the receiver run's `parent_run_id`, so `/v1/runs/:id/metrics?include=descendants` rolls up the whole tree.
- When both sides sign, the token is an Ed25519 attestation: the platform verifies the receiver was actually delegated to by that sender at that node hash. Unsigned runs still get the trace shape but no chain of custody.

For inline delegations within a single run (no separate sub-run), pass the same metadata to any node helper:

```ts
await run.step('route', {
  type: 'handoff',
  handoffFrom: 'router',
  handoffTo: 'refunds',
  handoffReason: 'category=refund',
}, async () => {});
```

See `invariance-platform/docs/observability.md` for the swimlane / `by_agent` metrics surface.

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
