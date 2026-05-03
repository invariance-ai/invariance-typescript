import { describe, it, expect } from 'vitest';
import { resolveConfig, DEFAULT_API_URL } from './config.js';

describe('resolveConfig', () => {
  it('throws if apiKey is empty', () => {
    expect(() => resolveConfig({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('uses default apiUrl when not provided', () => {
    const cfg = resolveConfig({ apiKey: 'inv_test_abc' });
    expect(cfg.apiUrl).toBe(DEFAULT_API_URL);
  });

  it('uses provided apiUrl', () => {
    const cfg = resolveConfig({ apiKey: 'inv_test_abc', apiUrl: 'http://localhost:3001' });
    expect(cfg.apiUrl).toBe('http://localhost:3001');
  });

  it('removes trailing slashes from apiUrl', () => {
    const cfg = resolveConfig({ apiKey: 'inv_test_abc', apiUrl: 'http://localhost:3001///' });
    expect(cfg.apiUrl).toBe('http://localhost:3001');
  });
});
