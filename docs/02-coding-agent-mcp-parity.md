# Coding-agent MCP parity

This doc scopes keeping the main TypeScript SDK's MCP server **shape-compatible** with the OSS [`invariance-loop`](https://github.com/invariance-ai/invariance-loop) MCP server.

The OSS Loop tool ships an MCP server with 6 tools that coding agents (Claude Code, Codex) call in-flow:

- `recent_sessions` — session-start context
- `my_patterns` — "what do I keep getting wrong here"
- `pending_findings` — between-session findings ready for `CLAUDE.md` / `AGENTS.md`
- `propose_rule` — drafts a rule from evidence run ids
- `compare_sessions` — "did adding that rule actually help"
- `trend` — cost / token / retry trends

When a user upgrades from OSS local to Invariance Cloud, **the agent should call the same tools with the same arguments** and get the same shape of response — just sourced from the cloud DB instead of local SQLite.

## Goal

A user with both surfaces installed (OSS Loop locally, main SDK / cloud connected for team features) should not have to think about which MCP server is responding. The agent calls `recent_sessions` and gets the right answer regardless of which backend served it.

## What needs to align

### Tool surface

| OSS Loop tool | Main SDK MCP equivalent | Notes |
|---|---|---|
| `recent_sessions(repo, days, limit)` | new compatibility tool backed by cloud run queries | closest existing SDK MCP tool is `invariance_list_runs`, but it has a different name and shape |
| `my_patterns(repo, days)` | new — needs implementation against cloud queries | |
| `pending_findings(repo)` | new — needs Findings query against cloud | |
| `propose_rule(repo, title, summary, proposed_rule, pattern_signature, rule_file, evidence_run_ids)` | new | writes through to platform |
| `compare_sessions(a, b)` | new | reuses existing per-run rollup queries |
| `trend(metric, period, days, repo)` | new | reuses existing trend endpoints |

Each tool's input/output schema should match exactly. The OSS server is the canonical source of truth — see [`invariance-loop/packages/mcp/src/server.ts`](https://github.com/invariance-ai/invariance-loop/blob/main/packages/mcp/src/server.ts).

### Response shape

Each tool returns `content[0].type=text` with a JSON string. The JSON shape per tool:

```typescript
recent_sessions: Array<{
  id: string;
  when: string;            // ISO 8601
  agent: string;           // 'claude-code' | 'codex' | ...
  repo: string | null;
  branch: string | null;
  prompt: string | null;
  tool_calls: number;
  files_touched: number;
  errors: number;
  cost_usd: number;
}>;

my_patterns: {
  hot_files: Array<{ file_path: string; edit_count: number; run_count: number }>;
  open_findings: Array<{ id: string; title: string; summary: string | null; rule_file: string | null; occurrences: number }>;
};

pending_findings: Array<{
  id: string;
  title: string;
  summary: string | null;
  rule_file: string | null;
  proposed_rule: string | null;
  occurrences: number;
  updated_at: string;       // ISO 8601
}>;

propose_rule: { id: string; created: boolean; status: string; title: string };

compare_sessions: {
  a: RunSummary;
  b: RunSummary;
  diff: { delta_cost_usd: number; delta_tokens: number; delta_node_count: number };
};

trend: {
  metric: 'cost' | 'tokens' | 'runs' | 'retries';
  period: 'day' | 'week' | 'month';
  buckets: Array<{ bucket: string; value: number }>;
  total: number;
};
```

### Server identity

The OSS server identifies as `name: "invariance-loop"`. The main SDK MCP server identifies as `name: "invariance"`. **Keep the names distinct.** Users may run both servers in parallel; collisions on tool names are fine (MCP namespaces by server) but identity must differentiate.

### Auth

OSS Loop has no auth — local SQLite. Main SDK MCP server uses the user's API key from environment / config. This stays unchanged. The auth surface is orthogonal to tool shape.

## Scope (estimated 1–1.5 days)

1. **Audit current `src/mcp/server.ts`** against the OSS server — list tools that exist, are missing, or have different shapes.
2. **Add the 6 compatibility tools** (`recent_sessions`, `my_patterns`, `pending_findings`, `propose_rule`, `compare_sessions`, `trend`) wired to the platform's existing query endpoints.
3. **Keep existing `invariance_*` tools intact**. The compatibility tools intentionally use the OSS names without the `invariance_` prefix so coding agents can call the same tool names on either server.
4. **Shape tests**: golden-file tests asserting that each tool's output JSON matches the OSS server's schema for an equivalent input. Tests live in `src/mcp/parity.test.ts` and use frozen OSS response fixtures, or import OSS schemas if `@invariance/loop-mcp/schemas` becomes available.
5. **Doc** in `README.md` referencing this doc and explaining the relationship.

## Non-goals

- Sharing the actual server implementation between OSS and main SDK. Different backends (SQLite vs cloud), different auth surfaces, different deploy footprints — code-sharing is not worth the coupling. **Schema parity is enough.**
- Changing OSS Loop's tools to match the main SDK. The OSS surface is the canonical one; the main SDK adapts.

## Verification

End-to-end test, once parity is in place:

1. User has both: OSS Loop running locally, main SDK MCP server connected to cloud
2. Agent calls `recent_sessions(repo='auth-service', days=7)` — both servers respond
3. Agent calls `compare_sessions(a, b)` with one local + one cloud run id — both servers return the same graceful error object for the unknown id; agent decides which backend to retry against
4. Schema compatibility test in CI runs against a frozen copy of the OSS schemas
