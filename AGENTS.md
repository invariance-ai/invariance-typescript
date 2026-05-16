# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, customer agents) that want to use `@invariance/sdk` from TypeScript / Node.js.

## What this SDK does

`@invariance/sdk` instruments AI agents: starts runs, emits trace nodes (tool calls, LLM calls, decisions, observations), and exposes monitors, signals, findings, evals, memory, and a knowledge base. Same surface as the [CLI](https://github.com/invariance-ai/invariance-cli) and [MCP server](https://github.com/invariance-ai/invariance-mcp).

## Setup (one-time, human-assisted)

A human must mint the API key from the dashboard (Settings → API keys). Once it's in the environment, the agent operates headlessly.

```bash
npm install @invariance/sdk
export INVARIANCE_API_KEY=inv_live_...
```

## Agent recipe: instrument a task

```ts
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({ apiKey: process.env.INVARIANCE_API_KEY! });

const userId = 'user_123';
const workspaceId = 'ws_456';

// Bare form returns a RunClient so you can capture the id for later reads.
const run = await inv.runs.start({
  name: 'refactor auth middleware',
  metadata: { repo: 'myorg/api', ticket: 'JIRA-123' },
});
const runId = run.runId;

try {
  await run.context({ userId, workspaceId });

  const result = await run.tool(
    'grep',
    { pattern: 'verifyToken' },
    async () => execGrep('verifyToken'),
  );

  await run.log('chose centralised auth', { branch: 'refactor' }, { type: 'decision' });

  await run.finish();
} catch (err) {
  await run.fail(err instanceof Error ? err.message : String(err));
  throw err;
}

// Read back later — same run, full trace
const finished = await inv.runs.get(runId);
```

Prefer the callback form when you don't need the id outside the block — it handles
finish/fail for you:

```ts
await inv.runs.start(
  { name: 'refactor auth middleware' },
  async (run) => {
    await run.log('starting', undefined, { type: 'observation' });
    // ... your work ...
  },
);
```

The `runs.start(opts, fn)` callback form wraps your work in a try/finally — the run is finished with status `completed` on success or `failed` (with the error) on throw. The bare `runs.start(opts)` form returns a `RunClient` and you call `run.finish()` / `run.fail(msg)` yourself.

## Error handling

All API failures throw `InvarianceApiError`. Branch on HTTP `status` for transport-level
decisions; branch on `code` (server-defined string) only when you've confirmed the
specific values the backend emits — the SDK passes them through verbatim and falls back
to `'unknown'` when the response body has no code:

```ts
import { InvarianceApiError, RateLimitError } from '@invariance/sdk';

try {
  await inv.runs.get(runId);
} catch (err) {
  if (err instanceof RateLimitError) {
    // 429, internal retries already exhausted — back off further.
  } else if (err instanceof InvarianceApiError) {
    if (err.status === 401 || err.status === 403) {
      // Invalid / expired key — surface to user, do not retry.
    } else if (err.status === 404) {
      // Run/resource doesn't exist — do not retry.
    } else if (err.status >= 500) {
      // Server error after retries — log and continue.
    }
    // err.code is whatever the server returned (or 'unknown'); switch on it only
    // against codes you've confirmed live against your backend version.
  } else {
    throw err; // network or unexpected
  }
}
```

`err.status` is the HTTP status; `err.code` is the server-supplied error code (or
`'unknown'`); `err.requestId` is the server-assigned ID for support tickets.

## Conventions

- **One run per user-facing task.** Don't batch unrelated work.
- **`run.tool(name, input, fn)`**: input must be JSON-serialisable, output is captured automatically, thrown errors are recorded on the node (status becomes `error`).
- **`run.log(message, data?, { type? })`**: `message` is a human-legible string; `data` is structured input; `type` (in opts) tags the node — typical values are `decision` or `observation`, but only `tool_call`, `llm_call`, `decision`, `observation` are indexed by monitors today.
- **Don't emit secrets.** Inputs/outputs are stored verbatim; redact API keys, tokens, PII before passing them in.
- **Keep node payloads small** (<8KB). Reference large artifacts by ID.

## Resources at a glance

`inv.runs`, `inv.nodes`, `inv.agents`, `inv.monitors`, `inv.signals`, `inv.findings`, `inv.reviews`, `inv.proofs`, `inv.narratives`, `inv.kb`, `inv.ask`, `inv.evals`, `inv.memory`.

Each is fully typed; rely on TS autocomplete rather than guessing method names.

## Multi-agent / handoff

When one agent hands off to another, use `run.handoff({ toAgentId, fromAgentId?, message?, reason? })` — when the run has a signing key, this Ed25519-signs the transition and returns a `HandoffToken` the receiving agent passes as `parentHandoffToken` on its own `runs.start(...)`. See `examples/instrument-run.ts`.

## When NOT to use this SDK

- For ad-hoc one-shot scripts where you don't need traces, just use the CLI (`inv run start ...`).
- For shell-driven workflows, prefer the CLI — easier to chain with `jq`.
- For Claude Desktop / Cursor MCP integrations, use [`@invariance/mcp`](https://github.com/invariance-ai/invariance-mcp).

## Reference

- API surface: [`README.md`](./README.md)
- Examples: [`examples/`](./examples/)
- CLI for the same operations: [`@invariance/cli`](https://github.com/invariance-ai/invariance-cli) + its [`AGENTS.md`](https://github.com/invariance-ai/invariance-cli/blob/main/AGENTS.md)
