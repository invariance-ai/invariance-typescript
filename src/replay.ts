/**
 * Deterministic replay support.
 *
 * Gated behind the `replay` feature flag (env `INVARIANCE_FEATURE_REPLAY=true`).
 * Unlike Python, JS has no global PRNG — this helper installs a deterministic
 * `Math.random` derived from the seed for the duration of `fn`. Consumers using
 * `crypto.randomUUID` etc. must seed those separately.
 */

import { createHash, webcrypto } from 'node:crypto';

export interface ReproducibilityOptions {
  seed: string;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = ((a + b) | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function seededRng(seed: string): () => number {
  const digest = createHash('sha256').update(seed).digest();
  return sfc32(
    digest.readUInt32BE(0),
    digest.readUInt32BE(4),
    digest.readUInt32BE(8),
    digest.readUInt32BE(12),
  );
}

function isEnabled(): boolean {
  const v = process.env?.INVARIANCE_FEATURE_REPLAY;
  return !!v && ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

/**
 * Run `fn` under a seeded `Math.random`. When the replay feature flag is off,
 * runs `fn` as-is with no overhead.
 */
export async function withReproducibility<T>(
  opts: ReproducibilityOptions,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isEnabled()) return fn();
  const original = Math.random;
  const rng = seededRng(opts.seed);
  Math.random = rng;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

// Re-exported so callers can build their own deterministic uuid if needed.
export { webcrypto };
