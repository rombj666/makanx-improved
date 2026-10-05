import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), handlers: new Map<string, () => void>() }));
vi.mock('../../lib/api', () => ({ api: { get: mocks.get, getUri: ({ url }: any) => url } }));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => ({ socket }) }));
vi.mock('recharts', () => {
  const Empty = () => null;
  return Object.fromEntries(['LineChart', 'Line', 'XAxis', 'YAxis', 'Tooltip', 'ResponsiveContainer', 'PieChart', 'Pie', 'Cell', 'Legend'].map(k => [k, Empty]));
});
import { VendorSales } from './VendorSales';
const socket = { on: (event: string, fn: () => void) => mocks.handlers.set(event, fn),
  off: (event: string) => mocks.handlers.delete(event) };
let tree: ReactTestRenderer;
let count: number;
beforeEach(async () => {
  vi.useFakeTimers(); count = 1;
  mocks.get.mockReset();
  mocks.get.mockImplementation(async (url: string) => ({ data: { data:
    url.endsWith('/summary') ? { orders: count } :
    url.endsWith('/product-trend') ? [] :
    url === '/analytics/products' ? [{ productName: 'Coffee', qtySold: 9, optionBreakdown: {}, remarks: [] }] :
    url.endsWith('/orders') ? [{ orderNumber: '#1', createdAt: '2026-10-04T01:00:00Z', items: [
      { productName: 'Coffee', qty: 2, selectedOptions: [{ choices: [{ label: 'Hot' }] }] },
      { productName: 'Tea', qty: 3, selectedOptions: [{ choices: [{ label: 'Cold' }] }] },
      { productName: 'Lemonade', qty: 4, selectedOptions: [{ choices: [{ label: 'Hot' }] }] },
    ] }] : {} } }));
  await act(async () => { tree = create(<VendorSales />); });
});
afterEach(() => { act(() => tree.unmount()); vi.useRealTimers(); });
it('counts quantities, hot/cold drinks, and lemonade as cold', () => {
  const rows = tree.root.findAllByType('tr').map(row => row.findAllByType('td').map(td => td.children.join('')));
  expect(rows).toContainEqual(['Hot Drinks', '2']);
  expect(rows).toContainEqual(['Cold Drinks', '7']);
  expect(rows).toContainEqual(['Total Drinks', '9']);
});
it('batches new-order refreshes for all analytics and usage, preserving selected date', async () => {
  await act(async () => { tree.root.findAllByProps({ type: 'date' })[0].props.onChange({ target: { value: '2026-10-04' } }); });
  mocks.get.mockClear(); count = 3;
  await act(async () => {
    mocks.handlers.get('order_created')!(); mocks.handlers.get('order_created')!();
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(mocks.get).toHaveBeenCalledTimes(5);
  for (const [url, config] of mocks.get.mock.calls) {
    if (url.startsWith('/analytics')) expect(config.params.date).toBe('2026-10-04');
  }
  expect(mocks.get).toHaveBeenCalledWith('/vendor/daily-usage');
  expect(tree.root.findAll(node => node.children.length === 1 && node.children[0] === '3').length).toBeGreaterThan(0);
  mocks.get.mockClear();
  await act(async () => { mocks.handlers.get('order_updated')!(); await vi.advanceTimersByTimeAsync(250); });
  expect(mocks.get).toHaveBeenCalledTimes(5);
  expect(tree.root.findAll(node => node.children.length === 1 && node.children[0] === '3').length).toBeGreaterThan(0);
});
it('unsubscribes and cancels scheduled refreshes on unmount', async () => {
  mocks.handlers.get('order_created')!();
  mocks.get.mockClear();
  act(() => tree.unmount());
  await vi.advanceTimersByTimeAsync(250);
  expect(mocks.handlers.size).toBe(0);
  expect(mocks.get).not.toHaveBeenCalled();
});
it('queues one follow-up refresh when orders arrive during a request', async () => {
  const original = mocks.get.getMockImplementation()!;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  mocks.get.mockClear();
  mocks.get.mockImplementationOnce(async (...args) => { await blocked; return original(...args); });
  await act(async () => {
    mocks.handlers.get('order_created')!();
    await vi.advanceTimersByTimeAsync(250);
    mocks.handlers.get('order_created')!();
    mocks.handlers.get('order_created')!();
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(mocks.get).toHaveBeenCalledTimes(5);
  await act(async () => { release(); await blocked; });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(mocks.get).toHaveBeenCalledTimes(10);
});
