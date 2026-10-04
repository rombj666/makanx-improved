import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('required JWT configuration', () => {
  it.each([undefined, '', '   '])('rejects missing or blank secrets', async (secret) => {
    vi.resetModules();
    vi.stubEnv('JWT_SECRET', secret || '');
    if (secret === undefined) delete process.env.JWT_SECRET;
    await expect(import('../utils/jwt')).rejects.toThrow('JWT_SECRET environment variable is required');
  });
});
