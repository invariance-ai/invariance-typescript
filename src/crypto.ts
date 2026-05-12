import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';

// @noble/ed25519 v2 requires providing a sync SHA-512 implementation.
(ed.etc as { sha512Sync?: (...m: Uint8Array[]) => Uint8Array }).sha512Sync =
  (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/**
 * Deterministic JSON serialization with lexicographic key ordering.
 * Arrays preserve order. undefined properties are omitted.
 * MUST be byte-identical to the backend's stableStringify.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) sorted[key] = sortKeys(v);
    }
    return sorted;
  }
  return value;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

export interface NodeHashPayload {
  id: string;
  run_id: string;
  agent_id: string;
  parent_id: string | null;
  action_type: string;
  input: unknown | null;
  output: unknown | null;
  error: unknown | null;
  metadata: Record<string, unknown>;
  custom_fields: Record<string, unknown>;
  timestamp: number;
  duration_ms: number | null;
  previous_hashes: string[];
  handoff_from?: string;
  handoff_to?: string;
  handoff_reason?: string;
}

export function hashNodePayload(payload: NodeHashPayload): string {
  return sha256Hex(stableStringify(payload));
}

/**
 * Canonical payload for a signed `POST /v1/runs` request. Binds the run-create
 * to the agent's signing key — proves origin even if the API key is leaked.
 * MUST stay byte-identical to the backend's `RunCreateHashPayload`.
 */
export interface RunCreateHashPayload {
  agent_id: string;
  name: string;
  metadata: Record<string, unknown>;
  replay_seed: string | null;
  parent_handoff_token: string | null;
  timestamp: number;
}

export function hashRunCreatePayload(payload: RunCreateHashPayload): string {
  return sha256Hex(stableStringify(payload));
}

/**
 * Canonical payload for a signed `PUT /v1/agents/me/key` request. Signed by
 * the **new** private key — proves the rotation is authorized by the holder
 * of the new key, not just by whoever has the API key.
 */
export interface KeyRotationHashPayload {
  agent_id: string;
  new_public_key: string;
  prev_public_key: string | null;
  timestamp: number;
}

export function hashKeyRotationPayload(payload: KeyRotationHashPayload): string {
  return sha256Hex(stableStringify(payload));
}

export interface Keypair {
  privateKey: string;
  publicKey: string;
}

export function generateKeypair(): Keypair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(publicKey) };
}

export function getPublicKey(privateKeyHex: string): string {
  return bytesToHex(ed.getPublicKey(hexToBytes(privateKeyHex)));
}

/**
 * Sign a hex-encoded message digest with an Ed25519 private key.
 * Returns a 128-char hex signature.
 */
export function signEd25519(messageHex: string, privateKeyHex: string): string {
  return bytesToHex(ed.sign(hexToBytes(messageHex), hexToBytes(privateKeyHex)));
}

export function verifyEd25519(messageHex: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed.verify(hexToBytes(signatureHex), hexToBytes(messageHex), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}
