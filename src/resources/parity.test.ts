import { describe, it, expect } from 'vitest';
import { stableStringify, hashNodePayload, type NodeHashPayload } from '../crypto.js';

/**
 * Cross-language parity: the TS SDK MUST produce byte-identical
 * canonical form and hash as the Python SDK for a fixed payload. The
 * expected values here are pinned in both test suites (TS: this file;
 * Python: tests/test_parity.py). Drift breaks cross-SDK signatures.
 */

const FIXTURE_PAYLOAD: NodeHashPayload = {
  id: 'node_0000000000000001',
  run_id: 'run_test',
  agent_id: 'agent_test',
  parent_id: null,
  action_type: 'tool_call',
  input: { query: 'refund' },
  output: { answer: 'ok' },
  error: null,
  metadata: { k: 'v' },
  custom_fields: { trace: 'abc' },
  timestamp: 1775900000000,
  duration_ms: 25,
  previous_hashes: ['aa', 'bb'],
};

const EXPECTED_CANONICAL =
  '{"action_type":"tool_call","agent_id":"agent_test",' +
  '"custom_fields":{"trace":"abc"},"duration_ms":25,"error":null,' +
  '"id":"node_0000000000000001","input":{"query":"refund"},' +
  '"metadata":{"k":"v"},"output":{"answer":"ok"},"parent_id":null,' +
  '"previous_hashes":["aa","bb"],"run_id":"run_test",' +
  '"timestamp":1775900000000}';

const EXPECTED_HASH = '8d9d5be0c9b7113508a613049362530dbbd9779f33b6ac2f32069b15853a93b1';

describe('cross-language parity', () => {
  it('canonical form matches pinned', () => {
    expect(stableStringify(FIXTURE_PAYLOAD)).toBe(EXPECTED_CANONICAL);
  });

  it('hash matches pinned', () => {
    expect(hashNodePayload(FIXTURE_PAYLOAD)).toBe(EXPECTED_HASH);
  });
});
