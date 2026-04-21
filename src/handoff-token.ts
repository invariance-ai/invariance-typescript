import { sha256Hex, signEd25519 } from './crypto.js';

const HEADER = { alg: 'Ed25519', typ: 'INV-HO/1' };

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlOfString(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

function stableJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + JSON.stringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

function randomNonceHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export interface HandoffTokenClaims {
  iss_agent_id: string;
  iss_run_id: string;
  handoff_node_id: string;
  handoff_node_hash: string;
  to_agent_id: string;
  iat: number;
  exp: number;
  nonce: string;
}

/** Signed delegation attestation. Opaque — callers should use `.encode()`. */
export class HandoffToken {
  constructor(
    public readonly claims: HandoffTokenClaims,
    private readonly encoded: string,
  ) {}

  encode(): string {
    return this.encoded;
  }
}

export function buildHandoffToken(args: {
  iss_agent_id: string;
  iss_run_id: string;
  handoff_node_id: string;
  handoff_node_hash: string;
  to_agent_id: string;
  signing_key: string;
  iat_ms: number;
  ttl_ms?: number;
  nonce?: string;
}): HandoffToken {
  const ttl = args.ttl_ms ?? 10 * 60 * 1000;
  const exp = args.iat_ms + ttl;
  const nonce = args.nonce ?? randomNonceHex();
  const claims: HandoffTokenClaims = {
    iss_agent_id: args.iss_agent_id,
    iss_run_id: args.iss_run_id,
    handoff_node_id: args.handoff_node_id,
    handoff_node_hash: args.handoff_node_hash,
    to_agent_id: args.to_agent_id,
    iat: args.iat_ms,
    exp,
    nonce,
  };
  const h = b64urlOfString(stableJson(HEADER));
  const c = b64urlOfString(stableJson(claims as unknown as Record<string, unknown>));
  const signingInput = `${h}.${c}`;
  const digest = sha256Hex(signingInput);
  const sig = signEd25519(digest, args.signing_key);
  return new HandoffToken(claims, `${signingInput}.${sig}`);
}
