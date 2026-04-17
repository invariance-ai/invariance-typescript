import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  getPublicKey,
  signEd25519,
  verifyEd25519,
  hashNodePayload,
  stableStringify,
} from './crypto.js';

describe('stableStringify', () => {
  it('sorts keys and preserves array order', () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 }, e: [{ y: 2, x: 1 }] }))
      .toBe('{"a":{"c":3,"d":4},"b":1,"e":[{"x":1,"y":2}]}');
  });

  it('omits undefined', () => {
    expect(stableStringify({ a: 1, b: undefined, c: null })).toBe('{"a":1,"c":null}');
  });
});

describe('hashNodePayload', () => {
  it('is key-order invariant', () => {
    const payload = {
      id: 'node_1',
      run_id: 'r',
      agent_id: 'a',
      parent_id: null,
      action_type: 't',
      input: { a: 1, b: 2 },
      output: null,
      error: null,
      metadata: { k: 'v' },
      custom_fields: {},
      timestamp: 100,
      duration_ms: null,
      previous_hashes: ['aa'],
    };
    const shuffled = Object.fromEntries(Object.entries(payload).reverse()) as typeof payload;
    expect(hashNodePayload(payload)).toBe(hashNodePayload(shuffled));
  });
});

describe('Ed25519 sign/verify', () => {
  it('roundtrips', () => {
    const { privateKey, publicKey } = generateKeypair();
    expect(getPublicKey(privateKey)).toBe(publicKey);

    const msg = 'deadbeef'.repeat(8);
    const sig = signEd25519(msg, privateKey);
    expect(sig).toHaveLength(128);
    expect(verifyEd25519(msg, sig, publicKey)).toBe(true);

    const tampered = 'c'.repeat(64);
    expect(verifyEd25519(tampered, sig, publicKey)).toBe(false);
  });
});
