export const DEFAULT_API_URL = 'https://api.invariance.dev';

export interface InvarianceConfig {
  apiKey: string;
  apiUrl?: string;
}

export function resolveConfig(config: InvarianceConfig): Required<InvarianceConfig> {
  if (!config.apiKey) {
    throw new Error('Invariance: apiKey is required');
  }
  return {
    apiKey: config.apiKey,
    apiUrl: config.apiUrl ?? DEFAULT_API_URL,
  };
}
