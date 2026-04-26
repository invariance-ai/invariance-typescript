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

## MCP server

This package ships an MCP (Model Context Protocol) server that exposes 36 Invariance tools (runs, nodes, monitors, signals, findings, reviews, agents, narratives, ask, KB) over stdio. Any MCP-aware client (Claude Desktop, Claude Code, Cursor, Windsurf, …) can call them directly.

Add to your MCP client config:

```json
{
  "mcpServers": {
    "invariance": {
      "command": "npx",
      "args": ["-y", "@invariance/sdk"],
      "env": {
        "INVARIANCE_API_KEY": "inv_live_…",
        "INVARIANCE_API_URL": "https://api.useinvariance.com"
      }
    }
  }
}
```

Or run the bin directly: `INVARIANCE_API_KEY=… npx invariance-mcp`.

Tool naming follows `invariance_<resource>_<action>` (e.g. `invariance_run_start`, `invariance_monitor_evaluate`, `invariance_signal_emit`). Six pre-1.0 names (`invariance_create_run`, `invariance_get_run`, `invariance_list_runs`, `invariance_write_node`, `invariance_list_nodes`, `invariance_verify_run`) are kept as aliases.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT. See [LICENSE](./LICENSE).
