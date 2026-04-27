export const DEFAULT_API_URL = 'https://api.useinvariance.com';

export interface Features {
  /** Enables deterministic seeding + run forking. Opt-in per deployment. */
  replay: boolean;
  /** Toggles whether instrumented LLM helpers attach token/cost metadata. */
  costTracking: boolean;
  /**
   * Master switch for trace emission. Defaults true. Set INVARIANCE_TRACE=0
   * to disable all observability without removing the SDK.
   */
  tracing: boolean;
}

export interface InvarianceConfig {
  apiKey?: string;
  apiUrl?: string;
  /** Ed25519 private key (32-byte hex). When set, nodes written via `client.runs` are signed. */
  signingKey?: string;
  features?: Partial<Features>;
}

export interface ResolvedConfig {
  apiKey: string;
  apiUrl: string;
  signingKey: string | null;
  features: Features;
}

function envBool(name: string, fallback: boolean): boolean {
  // Works in Node; in browser `process` may be undefined — callers must pass
  // the flag explicitly if they want to enable replay/cost tracking there.
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const raw = env?.[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function resolveConfig(config: InvarianceConfig = {}): ResolvedConfig {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const apiKey = config.apiKey ?? env?.INVARIANCE_API_KEY;
  if (!apiKey) {
    throw new Error('Invariance: apiKey is required (pass or set INVARIANCE_API_KEY)');
  }
  const features: Features = {
    replay: config.features?.replay ?? envBool('INVARIANCE_FEATURE_REPLAY', false),
    costTracking: config.features?.costTracking ?? envBool('INVARIANCE_COST_TRACKING', true),
    tracing: config.features?.tracing ?? envBool('INVARIANCE_TRACE', true),
  };
  return {
    apiKey,
    apiUrl: config.apiUrl ?? env?.INVARIANCE_API_URL ?? DEFAULT_API_URL,
    signingKey: config.signingKey ?? env?.INVARIANCE_SIGNING_KEY ?? null,
    features,
  };
}
