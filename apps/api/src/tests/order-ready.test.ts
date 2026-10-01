import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    vendorProfile: { findUnique: vi.fn() },
    order: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    orderItem: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
  emit: vi.fn(),
}));
vi.mock('../utils/prisma', () => ({ default: mocks.prisma }));
vi.mock('../socket', () => ({ getIO: () => ({ to: () => ({ emit: mocks.emit }) }) }));
import { getVendorLiveOrders, markBatchItemsReady, markOrderItemReady, markOrderItemsReady } from '../services/order.service';

let order: any;
beforeEach(() => {
  vi.resetAllMocks();
  order = { id: 'order', vendorId: 'vendor', customerId: 'guest', status: 'PREPARING', readyAt: null,
    items: [{ id: 'latte', orderId: 'order', status: 'PREPARING' }] };
  mocks.prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vendor' });
  mocks.prisma.order.findFirst.mockImplementation(async () => order);
  mocks.prisma.order.findUnique.mockImplementation(async () => order);
  mocks.prisma.order.findMany.mockImplementation(async () => [order]);
  mocks.prisma.order.update.mockImplementation(async ({ data }) => Object.assign(order, data));
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.orderItem.update.mockImplementation(async ({ where }) => {
    order.items.find((item: any) => item.id === where.id).status = 'READY';
  });
  mocks.prisma.orderItem.findMany.mockImplementation(async () => [order.items[0]]);
  mocks.prisma.orderItem.updateMany.mockImplementation(async ({ where }) => {
    const items = order.items.filter((item: any) => !where.id || where.id.in.includes(item.id));
    items.forEach((item: any) => { item.status = 'READY'; });
    return { count: items.length };
  });
});

describe('item ready workflow', () => {
  it('promotes a one-item order and returns and broadcasts the committed status', async () => {
    const result = await markOrderItemReady('staff', 'order', 'latte');
    expect(result.status).toBe('READY');
    expect(result.items[0].status).toBe('READY');
    expect(result.readyAt).toBeInstanceOf(Date);
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.orderItem.update.mock.invocationCallOrder[0]);
    expect(mocks.emit).toHaveBeenCalledWith('order_updated', result);
  });

  it('keeps a multi-item order preparing until the final item is ready', async () => {
    order.items.push({ id: 'americano', orderId: 'order', status: 'PREPARING' });
    await markOrderItemReady('staff', 'order', 'latte');
    expect(order.status).toBe('PREPARING');
    expect(order.readyAt).toBeNull();
    await markOrderItemReady('staff', 'order', 'americano');
    expect(order.status).toBe('READY');
    expect(order.items.every((item: any) => item.status === 'READY')).toBe(true);
  });

  it('does not reset timestamps when a ready action is retried', async () => {
    await markOrderItemReady('staff', 'order', 'latte');
    const timestamp = order.readyAt;
    await markOrderItemReady('staff', 'order', 'latte');
    expect(order.readyAt).toBe(timestamp);
    expect(mocks.prisma.order.update).toHaveBeenCalledTimes(1);
  });

  it('rejects an item outside the authorized order before mutation', async () => {
    await expect(markOrderItemReady('staff', 'order', 'other')).rejects.toThrow('Item not found');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks every item and its parent ready together', async () => {
    order.items.push({ id: 'americano', orderId: 'order', status: 'PREPARING' });
    await markOrderItemsReady('staff', 'order');
    expect(order.status).toBe('READY');
    expect(order.items.every((item: any) => item.status === 'READY')).toBe(true);
  });

  it('batch action promotes completed parents and returns orders for immediate UI updates', async () => {
    const result = await markBatchItemsReady('staff', 'menu', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
    expect(result.updatedCount).toBe(1);
    expect(result.orders[0]?.status).toBe('READY');
    expect(order).not.toHaveProperty('paymentStatus');
  });

  it('batch action leaves a parent preparing when another item is unfinished', async () => {
    order.items.push({ id: 'americano', orderId: 'order', status: 'PREPARING' });
    await markBatchItemsReady('staff', 'menu', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z');
    expect(order.status).toBe('PREPARING');
  });

  it('repairs inconsistent live orders without settling payment or selecting event history', async () => {
    order.items[0].status = 'READY';
    await getVendorLiveOrders('staff');
    expect(order.status).toBe('READY');
    expect(order).not.toHaveProperty('paymentStatus');
    expect(mocks.prisma.order.findMany).toHaveBeenNthCalledWith(1, {
      where: { vendorId: 'vendor', status: 'PREPARING', event: { status: 'ACTIVE' },
        items: { some: {}, every: { status: 'READY' } } }, select: { id: true },
    });
  });

  it('never promotes an empty order', async () => {
    order.items = [];
    await getVendorLiveOrders('staff');
    expect(order.status).toBe('PREPARING');
  });
});
