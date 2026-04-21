# TypeScript SDK Design

The TypeScript SDK is the primary developer integration for the clean Invariance MVP.

Platform design source:

```text
../invariance-platform/docs/00-mvp-system-design.md
```

Legacy reference:

```text
../_archive/invariance-sdk-legacy/packages/typescript
```

## SDK Boundary

The SDK only supports the MVP customer loop:

```text
start run -> write nodes -> finish run -> create monitor -> evaluate monitor -> inspect signals/reviews
```

Do not add methods for:

- A2A
- contracts
- evals
- datasets
- ontology
- governance
- prompt lifecycle
- LLM judge monitors
- custom code monitors

## Naming

Product/developer API uses `run`.

Backend API uses `session`.

SDK maps:

```text
run.id -> session.id
run.node(...) -> POST /v1/trace/events
run.finish() -> PATCH /v1/sessions/:id
```

Use `node`, not `traceNode`, in the public SDK.

## MVP API Shape

```ts
const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY!,
  apiUrl: process.env.INVARIANCE_API_URL,
});

const run = await inv.run.start({ name: "support-ticket" });

await run.node({
  action_type: "tool_call",
  input: { query: "refund" },
  output: { answer: "..." },
});

await run.finish();

const monitor = await inv.monitors.createSimple({
  name: "Dangerous output",
  evaluator: { type: "keyword", field: "output", keywords: ["dangerous"] },
  severity: "high",
  review: true,
});

await inv.monitors.evaluate(monitor.id);

const signals = await inv.signals.list();
const reviews = await inv.reviews.list();
```

## Modules

```text
Invariance
  run
  monitors
  signals
  reviews
```

### run

```ts
inv.run.start({ name, metadata? })
run.node({ action_type, input?, output?, error?, metadata? })
run.step(name, fn, opts?)
run.finish()
run.fail(error)
```

`run.step` is convenience. `run.node` is the primitive.

### monitors

```ts
inv.monitors.createSimple(body)
inv.monitors.list()
inv.monitors.get(id)
inv.monitors.evaluate(id)
inv.monitors.executions(id)
inv.monitors.findings(id)
```

MVP monitor body:

```ts
type SimpleMonitorBody = {
  name: string;
  evaluator:
    | { type: "keyword"; field: string; keywords: string[]; case_sensitive?: boolean }
    | { type: "threshold"; field: string; operator: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number };
  severity?: "low" | "medium" | "high" | "critical";
  review?: boolean;
  schedule?: { kind: "manual" } | { kind: "interval"; every_seconds: number };
};
```

SDK review creation maps to backend `creates_review: true`.

No `on_completion`, `on_error`, regex, LLM judge, or code monitor in the MVP.

### signals

```ts
inv.signals.list(filters?)
inv.signals.acknowledge(id)
```

### reviews

```ts
inv.reviews.list(filters?)
inv.reviews.get(id)
inv.reviews.claim(id)
inv.reviews.resolve(id, { decision, notes? })
```

## CLI

The CLI should be a thin wrapper over SDK methods.

```text
invariance monitors list
invariance monitors create-simple
invariance monitors evaluate <id>
invariance monitors findings <id>

invariance signals list
invariance signals ack <id>

invariance reviews list
invariance reviews claim <id>
invariance reviews resolve <id>
```

## MCP

MCP should expose the same surface as CLI.

Every MCP tool must validate arguments before calling the backend.

## Porting Notes

Useful legacy files:

```text
../_archive/invariance-sdk-legacy/packages/typescript/src/modules/run.ts
../_archive/invariance-sdk-legacy/packages/typescript/src/resources/trace.ts
../_archive/invariance-sdk-legacy/packages/typescript/src/resources/monitors.ts
../_archive/invariance-sdk-legacy/packages/typescript/src/resources/signals.ts
../_archive/invariance-sdk-legacy/packages/typescript/src/cli/app.ts
../_archive/invariance-sdk-legacy/packages/typescript/src/mcp/server.ts
```

Port only the ideas and tested ergonomics. Do not copy the legacy module graph wholesale.
