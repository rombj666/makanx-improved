import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), navigate: vi.fn(), error: vi.fn(), clear: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ vendorSlug: 'hour-coffee' }), useNavigate: () => mocks.navigate }));
vi.mock('react-hot-toast', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock('../../lib/api', () => ({ api: { get: async () => ({ data: { data: {
  id: 'vendor', slug: 'hour-coffee', businessName: 'Coffee', menuItems: [], settings: { orderingOpen: true },
} } }) } }));
vi.mock('../../lib/guest', () => ({ ensureGuestToken: async () => 'token', guestApi: { post: mocks.post } }));
vi.mock('../../hooks/useCustomerCart', () => ({ useCustomerCart: () => ({
  lines: [{ id: 'line', menuItemId: 'coffee', name: 'Coffee', quantity: 1, price: 5 }],
  totalItems: 1, total: 5, clear: mocks.clear,
}) }));
import { CustomerOrderPage } from './CustomerOrderPage';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });
it('submits checkout despite a legacy vendor lock and displays backend duplicate errors', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('React', React);
  const storage = new Map([['smart_qr_order_lock_hour-coffee', JSON.stringify({ orderId: 'old-order' })]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  mocks.post.mockResolvedValueOnce({ data: { data: { order: { id: 'new-order', eventOrderNumber: 2 } } } });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<CustomerOrderPage />); });
    const checkout = () => tree.root.findAllByType('button').find(button => button.props.disabled !== undefined)!;
    await act(async () => { await checkout().props.onClick(); });
    expect(mocks.post).toHaveBeenCalledWith('/public/vendors/hour-coffee/orders', expect.objectContaining({ vendorId: 'vendor' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/track/new-order');
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    const message = 'This device has already placed an order for this event today.';
    mocks.post.mockRejectedValueOnce({ response: { data: { message } } });
    await act(async () => { await checkout().props.onClick(); });
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalledWith(message);
  } finally { if (tree) act(() => tree.unmount()); }
});
