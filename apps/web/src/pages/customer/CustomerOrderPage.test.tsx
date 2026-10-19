import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), navigate: vi.fn(), error: vi.fn(), clear: vi.fn(), showPrices: true }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ vendorSlug: 'hour-coffee' }), useNavigate: () => mocks.navigate }));
vi.mock('react-hot-toast', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock('../../lib/api', () => ({ api: { get: async () => ({ data: { data: {
  id: 'vendor', slug: 'hour-coffee', businessName: 'Coffee', menuItems: [], settings: { orderingOpen: true, showPrices: mocks.showPrices },
} } }) } }));
vi.mock('../../lib/guest', () => ({ ensureGuestToken: async () => 'token', guestApi: { post: mocks.post } }));
vi.mock('../../hooks/useCustomerCart', () => ({ useCustomerCart: () => ({
  lines: [{ id: 'line', menuItemId: 'coffee', name: 'Coffee', quantity: 2, price: 5, remark: 'Less ice',
    selectedOptions: [{ groupId: 'milk', title: 'Milk', choiceIds: ['oat'], choiceLabels: ['Oat'] }] }],
  totalItems: 2, total: 10, clear: mocks.clear,
}) }));
import { CustomerOrderPage } from './CustomerOrderPage';
let tree: ReactTestRenderer;
const showModal = vi.fn();
const close = vi.fn();
const focus = vi.fn();
function button(label: string) {
  return tree.root.findAllByType('button').find(node => node.children.some(child => typeof child === 'string' && child.includes(label)))!;
}
async function mount() {
  await act(async () => { tree = create(<CustomerOrderPage />, { createNodeMock: element => element.type === 'dialog' ? { showModal, close } : null }); });
}
async function openCheckout() { await act(async () => { button('Checkout').props.onClick(); }); }
function name(value: string) { act(() => tree.root.findByType('input').props.onChange({ target: { value } })); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('React', React);
  vi.stubGlobal('document', { body: { style: { overflow: '' } }, activeElement: { focus } });
  mocks.showPrices = true;
  mocks.post.mockReset();
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });
it('opens a review modal without placing an order and preserves the cart on Back, close, Escape and backdrop', async () => {
  await mount();
  for (const action of ['Back', 'close', 'Escape', 'backdrop']) {
    await openCheckout();
    expect(showModal).toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Less ice');
    const dialog = tree.root.findByType('dialog');
    act(() => {
      if (action === 'Back') button('Back').props.onClick();
      if (action === 'close') tree.root.findByProps({ 'aria-label': 'Close checkout' }).props.onClick();
      if (action === 'Escape') dialog.props.onCancel({ preventDefault: vi.fn() });
      if (action === 'backdrop') { const target = {}; dialog.props.onClick({ target, currentTarget: target }); }
    });
    expect(tree.root.findAllByType('dialog')).toHaveLength(0);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(button('Checkout')).toBeDefined();
    expect(focus).toHaveBeenCalled();
  }
});
it.each(['', '   ', 'a'.repeat(51)])('blocks invalid name %s even if the handler is invoked', async value => {
  await mount(); await openCheckout(); name(value);
  expect(button('Place Order').props.disabled).toBe(true);
  await act(async () => { await button('Place Order').props.onClick(); });
  expect(mocks.post).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ id: 'checkout-name-error' }).children.length).toBeGreaterThan(0);
});
it.each(['Alex', 'John Tan', '小明', 'Wei Ming', 'a'.repeat(50)])('submits a trimmed valid name %s and navigates to tracking', async value => {
  mocks.post.mockResolvedValueOnce({ data: { data: { order: { id: 'new-order', eventOrderNumber: 2 } } } });
  await mount(); await openCheckout(); name(`  ${value}  `);
  expect(button('Place Order').props.disabled).toBe(false);
  await act(async () => { await button('Place Order').props.onClick(); });
  expect(mocks.post).toHaveBeenCalledWith('/public/vendors/hour-coffee/orders', expect.objectContaining({ vendorId: 'vendor', customerName: value,
    items: [expect.objectContaining({ quantity: 2, remark: 'Less ice', selectedOptions: [{ groupId: 'milk', choiceIds: ['oat'] }] })] }));
  expect(mocks.navigate).toHaveBeenCalledWith('/track/new-order');
  expect(mocks.clear).toHaveBeenCalledTimes(1);
});
it('keeps the modal, name and cart on failure and permits retry despite a legacy vendor lock', async () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ orderId: 'old-order' }) });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const message = 'This device has already placed an order for this event today.';
  mocks.post.mockRejectedValueOnce({ response: { data: { message } } });
  await mount(); await openCheckout(); name('Alex');
  await act(async () => { await button('Place Order').props.onClick(); });
  expect(mocks.error).toHaveBeenCalledWith(message);
  expect(tree.root.findByProps({ role: 'alert' }).children).toContain(message);
  expect(tree.root.findByType('input').props.value).toBe('Alex');
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  mocks.post.mockResolvedValueOnce({ data: { data: { order: { id: 'retry', eventOrderNumber: 3 } } } });
  await act(async () => { await button('Place Order').props.onClick(); });
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.navigate).toHaveBeenCalledWith('/track/retry');
  log.mockRestore();
});
it('blocks rapid concurrent submissions and dismissal while pending', async () => {
  let resolve!: (value: any) => void;
  mocks.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await openCheckout(); name('Alex');
  const submit = button('Place Order').props.onClick;
  let pending!: Promise<void>;
  act(() => { pending = submit(); void submit(); });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(button('Placing order...').props.disabled).toBe(true);
  expect(button('Back').props.disabled).toBe(true);
  act(() => {
    button('Back').props.onClick();
    tree.root.findByType('dialog').props.onCancel({ preventDefault: vi.fn() });
  });
  expect(tree.root.findAllByType('dialog')).toHaveLength(1);
  await act(async () => { resolve({ data: { data: { order: { id: 'new', eventOrderNumber: 1 } } } }); await pending; });
  expect(mocks.clear).toHaveBeenCalledTimes(1);
});
it.each([true, false])('shows prices and totals only when showPrices=%s', async showPrices => {
  mocks.showPrices = showPrices;
  await mount(); await openCheckout();
  // Read rendered text, avoiding React element props and internal references.
  const text = (node: any): string => typeof node === 'string' ? node : (node.children || []).map(text).join(' ');
  const content = text(tree.root.findByType('dialog'));
  expect(content.includes('RM 10.00')).toBe(showPrices);
  expect(content.includes('Total')).toBe(showPrices);
  expect(content).toContain('Milk'); expect(content).toContain('Oat'); expect(content).toContain('Less ice');
});
