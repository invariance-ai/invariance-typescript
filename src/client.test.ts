import { describe, it, expect } from 'vitest';
import { InvarianceApiError } from './client.js';

describe('InvarianceApiError', () => {
  it('stores status, code, and message', () => {
    const err = new InvarianceApiError(403, 'forbidden', 'Access denied');
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('Access denied');
    expect(err.name).toBe('InvarianceApiError');
  });
});
