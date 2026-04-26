# Known Issues — invariance-typescript

Seeded from the 2026-04-25 cross-repo audit. Close items by deleting the row when paid.

| ID | Severity | Title | Test | Status |
|----|----------|-------|------|--------|
| TS-002 | high | Local types are not pinned to `@invariance/api-types`; drift only caught at runtime | `src/api-types-contract.test.ts` | open |

## Item details

### TS-002 — `@invariance/api-types` not imported
The SDK redeclares `Run`, `Node`, `Monitor`, `Signal`, `Finding`, `Review`, `Narrative` locally rather than importing from `@invariance/api-types`. Comments mention "mirrors @invariance/api-types" — confirming intentional duplication, but it's unguarded.

Fix options:
1. Make `@invariance/api-types` a public sibling package and depend on it directly.
2. Keep inlined types, but enforce structural equivalence in CI via `src/api-types-contract.test.ts` (this PR adds the stub).

Done when either the SDK imports from `@invariance/api-types` or the contract test fails on platform-side schema drift.
