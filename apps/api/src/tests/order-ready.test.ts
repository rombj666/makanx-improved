import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    vendorProfile: { findUnique: vi.fn() },
    event: { findFirst: vi.fn(), update: vi.fn() },
    menuItem: { findMany: vi.fn() },
    order: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    orderItem: { aggregate: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
  emit: vi.fn(),
}));
vi.mock('../utils/prisma', () => ({ default: mocks.prisma }));
vi.mock('../socket', () => ({ getIO: () => ({ to: () => ({ emit: mocks.emit }) }) }));
import {
  bulkStatusUpdate, createOrder, getVendorLiveOrders, markBatchItemsReady,
  markOrderItemReady, markOrderItemsReady, updateOrderStatus,
} from '../services/order.service';

let order: any;
beforeEach(() => {
  vi.resetAllMocks();
  order = { id: 'order', vendorId: 'vendor', customerId: 'guest', status: 'PREPARING', readyAt: null,
    paymentStatus: 'PENDING', completedAt: null, event: { status: 'ACTIVE' },
    items: [{ id: 'latte', orderId: 'order', status: 'PREPARING' }] };
  mocks.prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vendor', settings: null });
  mocks.prisma.order.findFirst.mockImplementation(async () => order);
  mocks.prisma.order.findUnique.mockImplementation(async () => order);
  mocks.prisma.order.findMany.mockImplementation(async () => [order]);
  mocks.prisma.order.update.mockImplementation(async ({ data }) => Object.assign(order, data));
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.prisma.orderItem.findMany.mockImplementation(async () => [order.items[0]]);
  mocks.prisma.orderItem.updateMany.mockImplementation(async ({ where }) => {
    const items = order.items.filter((item: any) =>
      (!where.orderId || item.orderId === where.orderId) &&
      (!where.status || item.status === where.status) &&
      (!where.id || (typeof where.id === 'string' ? item.id === where.id : where.id.in.includes(item.id))));
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
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.orderItem.updateMany.mock.invocationCallOrder[0]);
    expect(mocks.emit).toHaveBeenCalledWith('order_updated', result);
    const customerPayload = mocks.emit.mock.calls[0][1];
    expect(customerPayload).not.toHaveProperty('customerId');
    expect(customerPayload).not.toHaveProperty('vendorId');
    expect(customerPayload.items[0]).not.toHaveProperty('orderId');
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
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.completedAt).toBeNull();
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
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.completedAt).toBeNull();
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

  it('keeps READY item and parent transitions idempotent and preserves readyAt', async () => {
    await markOrderItemReady('staff', 'order', 'latte');
    const readyAt = order.readyAt;
    const writes = mocks.prisma.orderItem.updateMany.mock.calls.length;
    await markOrderItemReady('staff', 'order', 'latte');
    await updateOrderStatus('order', 'staff', 'READY' as any);
    expect(order.status).toBe('READY');
    expect(order.readyAt).toBe(readyAt);
    expect(mocks.prisma.orderItem.updateMany).toHaveBeenCalledTimes(writes);
    expect(order.paymentStatus).toBe('PENDING');
  });

  it.each(['PREPARING', 'COMPLETED', 'CANCELLED', 'PLACED'])('rejects parent target %s', async (status) => {
    await expect(updateOrderStatus('order', 'staff', status as any)).rejects.toThrow('Only PREPARING to READY is allowed');
    expect(order.status).toBe('PREPARING');
  });

  it('does not let a parent become READY before every item is READY', async () => {
    await expect(updateOrderStatus('order', 'staff', 'READY' as any)).rejects.toThrow('All order items must be READY');
    expect(order.status).toBe('PREPARING');
  });

  it('rejects legacy item statuses instead of coercing them into READY', async () => {
    order.items[0].status = 'CANCELLED';
    await expect(markOrderItemReady('staff', 'order', 'latte')).rejects.toThrow('outside the preparation workflow');
    expect(order.items[0].status).toBe('CANCELLED');
  });

  it('bulk update marks items then reconciles parents and rejects every non-READY target', async () => {
    order.items.push({ id: 'americano', orderId: 'order', status: 'PREPARING' });
    expect(await bulkStatusUpdate('staff', ['order'], 'READY' as any)).toEqual({ updatedCount: 1 });
    expect(order.items.every((item: any) => item.status === 'READY')).toBe(true);
    expect(order.status).toBe('READY');
    expect(order.paymentStatus).toBe('PENDING');
    await expect(bulkStatusUpdate('staff', ['order'], 'PREPARING' as any)).rejects.toThrow('Only PREPARING to READY is allowed');
  });

  it('never reconciles historical completed-event orders', async () => {
    order.items[0].status = 'READY';
    order.event.status = 'COMPLETED';
    await getVendorLiveOrders('staff');
    expect(order.status).toBe('PREPARING');
    expect(order.readyAt).toBeNull();
    expect(mocks.prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('new order preparation defaults', () => {
  it('forces parent and every item to PREPARING regardless of request fields', async () => {
    const created: any[] = [];
    mocks.prisma.event.findFirst.mockResolvedValue({ id: 'event' });
    mocks.prisma.menuItem.findMany.mockResolvedValue([{ id: 'coffee', vendorId: 'vendor', price: '0.30', optionGroups: [], basePrepMin: 5 }]);
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ id: 'event', nextOrderNumber: 1, orderingStatus: 'OPEN' }]).mockResolvedValueOnce([]);
    mocks.prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    mocks.prisma.event.update.mockResolvedValue({});
    mocks.prisma.order.create.mockImplementation(async ({ data }) => { created.push(data); return { id: 'new', ...data, items: data.items.create }; });

    await createOrder('guest:A', {
      vendorId: 'vendor', guestId: 'guest:A', status: 'READY',
      items: [{ menuItemId: 'coffee', quantity: 2, status: 'READY' }],
    });
    expect(created[0].status).toBe('PREPARING');
    expect(created[0].items.create).toEqual([expect.objectContaining({ status: 'PREPARING' })]);
  });
});
