import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { applyLiveOrder, belongsInKitchen } from './liveOrders';

describe('Live Orders committed response handling', () => {
  it('moves a one-item order from Kitchen to Ready without fetching', () => {
    const initial = { id: 'one', status: 'PREPARING', items: [{ status: 'PREPARING' }] };
    const committed = { ...initial, status: 'READY', items: [{ status: 'READY' }] };
    expect(applyLiveOrder([initial], committed, 'kitchen')).toEqual([]);
    expect(applyLiveOrder([], committed, 'ready')).toEqual([committed]);
  });

  it('keeps partial progress visible and moves only after the final item', () => {
    const partial = { id: 'two', status: 'PREPARING', items: [{ status: 'READY' }, { status: 'PREPARING' }] };
    expect(applyLiveOrder([], partial, 'kitchen')).toEqual([partial]);
    expect(applyLiveOrder([], partial, 'ready')).toEqual([]);
    const final = { ...partial, status: 'READY', items: [{ status: 'READY' }, { status: 'READY' }] };
    expect(applyLiveOrder([partial], final, 'kitchen')).toEqual([]);
    expect(applyLiveOrder([], final, 'ready')).toEqual([final]);
    expect(applyLiveOrder([final], final, 'ready')).toEqual([final]);
  });

  it('excludes inconsistent all-ready orders from Kitchen', () => {
    expect(belongsInKitchen({ id: 'stale', status: 'PREPARING', items: [{ status: 'READY' }] })).toBe(false);
  });
});


const dashboardMocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), connected: true,
  handlers: new Map<string, Set<(order?: any) => void>>(),
}));
vi.mock('./api', () => ({ api: { get: dashboardMocks.get, post: dashboardMocks.post } }));
vi.mock('../context/SocketContext', () => ({ useSocket: () => ({ socket: dashboardSocket, isConnected: dashboardMocks.connected }) }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { VendorDashboard } from '../pages/vendor/Dashboard';
const dashboardSocket = {
  on(event: string, handler: (order?: any) => void) {
    if (!dashboardMocks.handlers.has(event)) dashboardMocks.handlers.set(event, new Set());
    dashboardMocks.handlers.get(event)!.add(handler);
  },
  off(event: string, handler: (order?: any) => void) { dashboardMocks.handlers.get(event)?.delete(handler); },
};
function emit(event: string, order?: any) { dashboardMocks.handlers.get(event)?.forEach(handler => handler(order)); }
function liveOrder(id: string, status = 'PREPARING') {
  return { id, vendorId: 'vendor', eventOrderNumber: id, status, customerName: id === '1' ? 'Alex' : '小明',
    createdAt: '2026-10-16T01:00:00Z', event: { id: 'active', status: 'ACTIVE', eventName: 'Coffee', eventDate: '2026-10-16' },
    items: [{ id: `item-${id}`, quantity: 1, status, menuItem: { id: 'coffee', name: 'Coffee' } }] };
}
function textOf(tree: ReactTestRenderer) { return JSON.stringify(tree.toJSON()); }
function kitchenOrderCount(tree: ReactTestRenderer, id: string) {
  return tree.root.findAll(node => node.type === 'h3' && node.children.join('') === `Order #${id}`).length;
}

describe('dashboard reconciliation and socket lifecycle', () => {
  let tree: ReactTestRenderer;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T02:00:00Z'));
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
    dashboardMocks.connected = true;
    dashboardMocks.handlers.clear();
    dashboardMocks.get.mockReset().mockResolvedValue({ data: { success: true, data: [] } });
    dashboardMocks.post.mockReset();
    await act(async () => { tree = create(React.createElement(VendorDashboard)); });
  });
  afterEach(() => {
    act(() => tree.unmount());
    vi.useRealTimers(); vi.unstubAllGlobals();
  });

  it('uses one active live request on mount and reconciles every five minutes for eight hours', async () => {
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
    expect(dashboardMocks.get).toHaveBeenCalledWith('/orders/vendor-live', expect.objectContaining({ timeout: 20000, signal: expect.any(AbortSignal) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(299999); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000 - 300000); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(97);
  });

  it('applies created events once and moves READY to history without fetching', async () => {
    await act(async () => { emit('order_created', liveOrder('1')); emit('order_created', liveOrder('1')); emit('order_created', liveOrder('2')); });
    expect(kitchenOrderCount(tree, '1')).toBe(1);
    expect(kitchenOrderCount(tree, '2')).toBe(1);
    await act(async () => { emit('order_updated', liveOrder('1', 'READY')); emit('order_updated', liveOrder('1', 'READY')); });
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    await act(async () => { emit('order_created', liveOrder('1')); });
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    await act(async () => {
      tree.root.findAllByType('button').find(button => button.children.includes('Ready Orders'))!.props.onClick();
    });
    expect(tree.root.findAll(node => node.type === 'span' && node.children.join('') === '1 ready orders').length).toBeGreaterThan(0);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
  });

  it('shows socket names in both Kitchen layouts and Ready History, with a legacy fallback', async () => {
    await act(async () => {
      emit('order_created', liveOrder('1'));
      emit('order_created', { ...liveOrder('2'), customerName: null });
    });
    const names = (value: string) => tree.root.findAll(node => node.type === 'p' && node.children.join('') === value);
    expect(names('Alex')).toHaveLength(2);
    expect(names('—')).toHaveLength(2);
    await act(async () => { emit('order_updated', { ...liveOrder('1', 'READY'), customerName: undefined }); });
    await act(async () => { tree.root.findAllByType('button').find(button => button.children.includes('Ready Orders'))!.props.onClick(); });
    await act(async () => { tree.root.findAllByType('button').find(button => button.children.includes('Expand'))!.props.onClick(); });
    expect(names('Alex')).toHaveLength(2);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
  });

  it('restores names from the lightweight API on reconnect', async () => {
    dashboardMocks.get.mockResolvedValueOnce({ data: { success: true, data: [liveOrder('1'), liveOrder('2', 'READY')] } });
    await act(async () => { emit('connect'); });
    expect(textOf(tree)).toContain('Alex');
    await act(async () => { tree.root.findAllByType('button').find(button => button.children.includes('Ready Orders'))!.props.onClick(); });
    await act(async () => { tree.root.findAllByType('button').find(button => button.children.includes('Expand'))!.props.onClick(); });
    expect(textOf(tree)).toContain('小明');
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
  });

  it('preserves the oldest-first production order across socket inserts', async () => {
    const newer = { ...liveOrder('2'), createdAt: '2026-10-16T02:00:00Z' };
    await act(async () => { emit('order_created', newer); emit('order_created', liveOrder('1')); });
    const headings = tree.root.findAllByType('h3').map(node => node.children.join(''));
    expect(headings).toEqual(['Order #1', 'Order #2']);
  });

  it('merges socket changes during a stale snapshot without losing other snapshot orders', async () => {
    let resolve!: (value: any) => void;
    dashboardMocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { emit('connect'); });
    await act(async () => { emit('order_created', liveOrder('3')); emit('order_updated', liveOrder('1', 'READY')); });
    await act(async () => { resolve({ data: { success: true, data: [liveOrder('1'), liveOrder('2')] } }); });
    expect(kitchenOrderCount(tree, '3')).toBe(1);
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    expect(kitchenOrderCount(tree, '2')).toBe(1);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
  });

  it('polls every thirty seconds disconnected, preserves orders on failure, and recovers on reconnect', async () => {
    await act(async () => { emit('order_created', liveOrder('1')); });
    dashboardMocks.connected = false;
    await act(async () => { tree.update(React.createElement(VendorDashboard)); });
    dashboardMocks.get.mockRejectedValueOnce(new Error('offline'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(kitchenOrderCount(tree, '1')).toBe(1);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
    dashboardMocks.get.mockResolvedValueOnce({ data: { success: true, data: [liveOrder('1', 'READY'), liveOrder('4')] } });
    dashboardMocks.connected = true;
    await act(async () => { emit('connect'); tree.update(React.createElement(VendorDashboard)); });
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    expect(kitchenOrderCount(tree, '4')).toBe(1);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });

  it('coalesces overlapping reconnect requests into one follow-up', async () => {
    let resolve!: (value: any) => void;
    dashboardMocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { emit('connect'); emit('connect'); emit('vendor_orders_changed'); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { resolve({ data: { success: true, data: [] } }); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(3);
  });

  it('refreshes on visibility return and coalesces the simultaneous focus trigger', async () => {
    const visibility = vi.mocked(document.addEventListener).mock.calls.find(call => call[0] === 'visibilitychange')![1] as () => void;
    const focus = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === 'focus')![1] as () => void;
    Object.assign(document, { visibilityState: 'hidden' });
    await act(async () => { await vi.advanceTimersByTimeAsync(300000); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
    Object.assign(document, { visibilityState: 'visible' });
    await act(async () => { visibility(); focus(); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
  });

  it('queues reconciliation when focus returns during an older outstanding fetch', async () => {
    let resolve!: (value: any) => void;
    dashboardMocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { emit('connect'); });
    await vi.advanceTimersByTimeAsync(3000);
    const focus = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === 'focus')![1] as () => void;
    act(() => { focus(); focus(); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { resolve({ data: { success: true, data: [] } }); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(3);
  });

  it('applies batch READY results from the existing top-level response', async () => {
    await act(async () => { emit('order_created', liveOrder('1')); });
    dashboardMocks.post.mockResolvedValue({ data: { success: true, orders: [liveOrder('1', 'READY')] } });
    await act(async () => { tree.root.findAllByType('input').find(input => input.props.type === 'checkbox')!.props.onChange({ target: { checked: true } }); });
    await act(async () => { await tree.root.findAllByType('button').find(button => button.children.includes('Ready'))!.props.onClick(); });
    expect(textOf(tree)).toContain('No grouped production data.');
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
  });

  it('backs off all triggers for thirty seconds after rate limiting, then retries', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    dashboardMocks.get.mockRejectedValueOnce({ response: { status: 429 } });
    await act(async () => { emit('connect'); });
    await act(async () => { emit('connect'); emit('vendor_orders_changed'); await vi.advanceTimersByTimeAsync(29999); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(dashboardMocks.get).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });

  it('preserves partial item progress when older API or socket responses arrive', async () => {
    const initial = liveOrder('1');
    initial.items.push({ ...initial.items[0], id: 'second' });
    const first = { ...initial, items: initial.items.map((item, index) => ({ ...item, status: index === 0 ? 'READY' : 'PREPARING' })) };
    const second = { ...initial, items: initial.items.map((item, index) => ({ ...item, status: index === 1 ? 'READY' : 'PREPARING' })) };
    await act(async () => { emit('order_created', initial); emit('order_updated', first); emit('order_updated', second); });
    // A delayed PREPARING parent cannot restore either ready item to production.
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    await act(async () => { emit('order_updated', { ...initial, status: 'READY', items: initial.items.map(item => ({ ...item, status: 'READY' })) }); });
    expect(kitchenOrderCount(tree, '1')).toBe(0);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
  });

  it('aborts an outstanding request on unmount and ignores its late result', async () => {
    let resolve!: (value: any) => void;
    dashboardMocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { emit('connect'); });
    const signal = dashboardMocks.get.mock.calls.at(-1)![1].signal as AbortSignal;
    act(() => tree.unmount());
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ data: { success: true, data: [liveOrder('1')] } }); });
    await vi.advanceTimersByTimeAsync(300000);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(2);
  });

  it('removes only its own listeners and cancels polling when unmounted', async () => {
    const soundListener = vi.fn();
    dashboardSocket.on('order_created', soundListener);
    act(() => tree.unmount());
    emit('order_created', liveOrder('1'));
    expect(soundListener).toHaveBeenCalledTimes(1);
    expect(dashboardMocks.handlers.get('order_created')?.size).toBe(1);
    expect(dashboardMocks.handlers.get('order_updated')?.size).toBe(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(dashboardMocks.get).toHaveBeenCalledTimes(1);
  });
});
