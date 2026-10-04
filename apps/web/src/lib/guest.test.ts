import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), use: vi.fn(), get: vi.fn() }));
vi.mock('./api', () => ({ api: { defaults: { baseURL: 'https://example.test/api' } } }));
vi.mock('axios', () => ({ default: {
  post: mocks.post,
  create: () => ({ interceptors: { request: { use: mocks.use } }, get: mocks.get }),
} }));
import { ensureGuestToken, getMyOrders } from './guest';
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ data: { data: { guestId: 'guest:new', guestAccessToken: 'signed-token' } } });
});
describe('guest browser credentials', () => {
  it('preserves legacy identity without sending it as proof and deduplicates initialization', async () => {
    values.set('smart_qr_guest_id', 'legacy-id');
    expect(await Promise.all([ensureGuestToken(), ensureGuestToken()])).toEqual(['signed-token', 'signed-token']);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][1]).toEqual({});
    expect(values.get('smart_qr_legacy_guest_id')).toBe('legacy-id');
    expect(values.get('smart_qr_guest_id')).toBe('guest:new');
    expect(await ensureGuestToken()).toBe('signed-token');
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('renews using only the existing signed credential', async () => {
    values.set('smart_qr_guest_credential', JSON.stringify({ guestAccessToken: 'old-signed-token', renewedAt: 0 }));
    await ensureGuestToken();
    expect(mocks.post.mock.calls[0][2].headers).toEqual({ Authorization: 'Bearer old-signed-token' });
  });
  it('does not silently discard an expired identity or vendor login', async () => {
    const saved = JSON.stringify({ guestAccessToken: 'expired', renewedAt: 0 });
    values.set('smart_qr_guest_credential', saved);
    values.set('token', 'vendor-login');
    mocks.post.mockRejectedValue(new Error('Unauthorized'));
    await expect(ensureGuestToken()).rejects.toThrow('Unauthorized');
    expect(values.get('smart_qr_guest_credential')).toBe(saved);
    expect(values.get('token')).toBe('vendor-login');
  });
  it('attaches bearer authentication and requests history without guestId', async () => {
    const config = await mocks.use.mock.calls[0][0]({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer signed-token');
    mocks.get.mockResolvedValue({ data: { data: [{ id: 'order' }] } });
    expect(await getMyOrders()).toEqual([{ id: 'order' }]);
    expect(mocks.get).toHaveBeenCalledWith('/orders/my-orders');
  });
});
