# Invariance TypeScript SDK

Official TypeScript SDK for the [Invariance AI](https://invariance.ai) platform. Create cases for workflow instances, attach runs/nodes as evidence, and close outcomes from any TypeScript or Node.js agent stack.

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

## Quickstart: Trace A Workflow Instance

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

const c = await inv.cases.create({
  workflowKey: 'support.escalation',
  tenantId: 'acme',
  endUserId: 'cus_123',
});

await inv.cases.with(c, async () => {
  await inv.runs.start({ name: 'triage' }, async (run) => {
    await run.tool('zendesk.ticket.read', { ticket_id: '123' });
    await run.log('decision', { status: 'resolved' });
  });
});

await inv.cases.close(c.id, { outcome: 'resolved', valueUsd: 250 });
```

Cases are workflow instances. Runs remain the execution evidence layer; `run.step(...)`, `run.log`, `run.context`, and `run.tool` emit nodes inside that evidence.

Run the included smoke example from this repo:

```bash
INVARIANCE_API_KEY=inv_test_... pnpm tsx examples/instrument-run.ts
```

## Agent-Managed Runs

Agents should create and close their own runs around each interview, task, or autonomous loop. Use the callback form when the agent is running in process, because it always finishes or fails the run:

```ts
await inv.runs.start({ name: 'candidate-interview' }, async (run) => {
  await run.context({ candidateId, role: 'support-agent' });
  await run.log('interview started');

  const answer = await run.tool('ask_question', { question: 'How would you inspect a failed run?' }, async () => {
    return interviewAgent.answer();
  });

  await run.log('interview answer', answer);
  await run.verify();
});
```

For agent frameworks that call tools, expose the MCP server below and let the agent call `invariance_create_run`, `invariance_write_node`, `invariance_finish_run` or `invariance_fail_run`, `invariance_create_monitor`, `invariance_evaluate_monitor`, and the review/signal tools itself.

## MCP Server

Install or build the SDK, then point any MCP host at the stdio server:

```bash
INVARIANCE_API_KEY=inv_test_... npx -y --package @invariance/sdk invariance-mcp
```

Local checkout:

```bash
pnpm build
INVARIANCE_API_KEY=inv_test_... node dist/mcp/server.js
```

Example host config:

```json
{
  "mcpServers": {
    "invariance": {
      "command": "invariance-mcp",
      "env": {
        "INVARIANCE_API_KEY": "inv_test_..."
      }
    }
  }
}
```

The server exposes tools for runs, nodes, proof verification, starter monitor creation/evaluation, signals, findings, reviews, and agent identity. It follows the MCP pattern of tools for model-invoked actions; resources/prompts can be added later for read-only documentation and reusable review workflows.

## Starter Eval

The fastest way to give new users something useful after setup is a tiny scenario eval: run a normal case and a risky case, attach a monitor, and produce a review for the risky run.

```bash
INVARIANCE_API_KEY=inv_test_... pnpm tsx examples/starter-eval.ts
```

That example is intentionally small. It teaches the product loop without introducing a separate eval framework: run -> nodes -> proof -> monitor -> signal/finding/review.

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
