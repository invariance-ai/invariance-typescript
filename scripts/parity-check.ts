/**
 * Cross-SDK resource parity check.
 *
 * Verifies that the TS Invariance class exposes the same set of resources
 * as the Python Invariance class. Drift here means the SDKs are no longer
 * a 1:1 mirror, which is a contract we want to keep.
 *
 * Run: pnpm parity
 *
 * Exits non-zero on drift so it can be wired into CI.
 */
import { Invariance } from '../src/index.js';

// Map TS camelCase resource names to Python snake_case for comparison.
const TS_TO_PY: Record<string, string> = {
  runs: 'runs',
  nodes: 'nodes',
  agents: 'agents',
  monitors: 'monitors',
  signals: 'signals',
  proofs: 'proofs',
  findings: 'findings',
  reviews: 'reviews',
  narratives: 'narratives',
  nodeTypes: 'node_types',
  kb: 'kb',
  ask: 'ask',
  evals: 'evals',
  memory: 'memory',
  recipes: 'recipes',
  guardrails: 'guardrails',
  cases: 'cases',
  events: 'events',
  workflowDefinitions: 'workflow_definitions',
  cortex: 'cortex',
};

const PY_RESOURCES = [
  'runs',
  'nodes',
  'agents',
  'monitors',
  'signals',
  'proofs',
  'findings',
  'reviews',
  'narratives',
  'node_types',
  'kb',
  'ask',
  'evals',
  'recipes',
  'guardrails',
  'cases',
  'cortex',
];

// Memory is intentionally shipping TS-first so CLI and MCP can consume the
// types before Python parity lands. Operators + sessions follow the same
// pattern — TS lands first so CLI/MCP/dashboard can wire the company-brain
// surfaces, Python catches up in a follow-up.
const INTENTIONAL_TS_ONLY_RESOURCES = new Set([
  'memory',
  'operators',
  'sessions',
  'events',
  'workflow_definitions',
]);

function tsResources(): string[] {
  const inst = Invariance.init({ apiKey: 'inv_test_dummy', apiUrl: 'http://localhost:0' });
  return Object.keys(inst).filter((k) => {
    const v = (inst as unknown as Record<string, unknown>)[k];
    return v !== null && typeof v === 'object' && k !== 'features' && k !== 'http';
  });
}

function main(): void {
  const ts = new Set(tsResources());
  const tsExpectedFromPy = new Set(
    PY_RESOURCES.map((p) => Object.keys(TS_TO_PY).find((k) => TS_TO_PY[k] === p) ?? p),
  );
  const py = new Set(PY_RESOURCES);
  const tsAsPy = new Set(
    [...ts].map((k) => TS_TO_PY[k] ?? k.replace(/([A-Z])/g, '_$1').toLowerCase()),
  );

  const missingFromTs = [...tsExpectedFromPy].filter((k) => !ts.has(k));
  const missingFromPy = [...tsAsPy].filter(
    (k) => !py.has(k) && !INTENTIONAL_TS_ONLY_RESOURCES.has(k),
  );
  const extraInTs = [...ts].filter(
    (k) => !tsExpectedFromPy.has(k) && !INTENTIONAL_TS_ONLY_RESOURCES.has(TS_TO_PY[k] ?? k),
  );

  let drift = false;
  if (missingFromTs.length > 0) {
    console.error('Resources present in Python SDK but missing from TS SDK:', missingFromTs);
    drift = true;
  }
  if (missingFromPy.length > 0) {
    console.error('Resources present in TS SDK but missing from Python SDK:', missingFromPy);
    drift = true;
  }
  const intentionalTsOnly = [...tsAsPy].filter(
    (k) => !py.has(k) && INTENTIONAL_TS_ONLY_RESOURCES.has(k),
  );
  if (intentionalTsOnly.length > 0) {
    console.warn('Resources intentionally TS-only pending Python parity:', intentionalTsOnly);
  }
  if (extraInTs.length > 0 && !drift) {
    console.warn('TS SDK has unmapped resources (update TS_TO_PY):', extraInTs);
  }

  if (drift) {
    console.error('\nCross-SDK resource parity FAILED.');
    process.exit(1);
  }
  console.log('Cross-SDK resource parity OK:', [...ts].sort().join(', '));
}

main();
