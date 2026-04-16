export const DEFAULT_API_URL = 'https://api.invariance.dev';

export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
  /** Ed25519 private key (32-byte hex). When set, nodes written via `client.runs` are signed. */
  signingKey?: string;
}

export interface ResolvedConfig {
  apiKey: string;
  apiUrl: string;
  signingKey: string | null;
}

export function resolveConfig(config: InvarianceConfig): ResolvedConfig {
  if (!config.apiKey) {
    throw new Error('Invariance: apiKey is required');
  }
  return {
    apiKey: config.apiKey,
    apiUrl: config.apiUrl ?? DEFAULT_API_URL,
    signingKey: config.signingKey ?? null,
  };
}
