import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({
  vendorProfile: { findUnique: vi.fn() }, event: { findFirst: vi.fn(), update: vi.fn() },
  menuItem: { findMany: vi.fn() }, order: { findFirst: vi.fn(), create: vi.fn() },
  orderItem: { aggregate: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock('../utils/prisma', () => ({ default: mocks }));
vi.mock('../socket', () => ({ getIO: () => ({ to: () => ({ emit: vi.fn() }) }) }));
import { createOrder } from '../services/order.service';
const input = { vendorId: 'vendor', guestId: 'guest', items: [{ menuItemId: 'coffee', quantity: 1 }] };
let settings: any;
let eventId: string;
let rows: any[];
const duplicate = (target = ['eventId', 'deviceId', 'deviceOrderDate']) =>
  new Prisma.PrismaClientKnownRequestError('Raw database duplicate', { code: 'P2002', clientVersion: '5', meta: { target } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T15:59:59Z'));
  settings = { deviceOrderLimitEnabled: true, maxDrinksPerOrder: 2, dailyLimitEnabled: false, dailyLimitQuantity: 10 };
  eventId = 'event-a'; rows = [];
  mocks.vendorProfile.findUnique.mockImplementation(async () => ({ id: 'vendor', settings }));
  mocks.event.findFirst.mockImplementation(async () => ({ id: eventId }));
  mocks.menuItem.findMany.mockResolvedValue([{ id: 'coffee', price: 5, basePrepMin: 5, optionGroups: [] }]);
  mocks.$transaction.mockImplementation(async (callback) => callback(mocks));
  mocks.$queryRaw.mockImplementation(async (query) => query.strings.join('').includes('VendorSettings')
    ? [settings] : [{ id: eventId, nextOrderNumber: rows.length + 1, orderingStatus: 'OPEN' }]);
  mocks.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
  mocks.order.findFirst.mockImplementation(async ({ where }) => rows.find(row =>
    row.eventId === where.eventId && row.deviceId === where.deviceId && row.deviceOrderDate === where.deviceOrderDate));
  // Model PostgreSQL's nullable composite unique constraint.
  mocks.order.create.mockImplementation(async ({ data }) => {
    if (data.deviceOrderDate !== null && rows.some(row => row.eventId === data.eventId
      && row.deviceId === data.deviceId && row.deviceOrderDate === data.deviceOrderDate)) throw duplicate();
    const row = { ...data, id: `order-${rows.length + 1}` }; rows.push(row); return row;
  });
});
afterEach(() => vi.useRealTimers());
describe('device order eligibility', () => {
  it('allows repeat orders with a NULL date and no lookup when disabled', async () => {
    settings.deviceOrderLimitEnabled = false;
    await createOrder(undefined, input, 'device');
    await createOrder(undefined, input, 'device');
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.deviceOrderDate === null && row.deviceId === 'device')).toBe(true);
    expect(mocks.order.findFirst).not.toHaveBeenCalled();
  });
  it('accepts the first order with the Malaysia date and preserves guest ownership', async () => {
    const { order } = await createOrder(undefined, input, 'device');
    expect(order).toMatchObject({ deviceOrderDate: '2026-10-06', deviceId: 'device', customerId: 'guest' });
  });
  it('rejects the same device/event/day even with a different guest identity', async () => {
    await createOrder(undefined, input, 'device');
    await expect(createOrder(undefined, { ...input, guestId: 'another-guest' }, 'device')).rejects.toMatchObject({
      code: 'DEVICE_ORDER_EXISTS', existingOrderId: 'order-1',
      message: 'This device has already placed an order for this event today.',
    });
    expect(rows).toHaveLength(1);
  });
  it('allows the next Malaysia day at midnight', async () => {
    await createOrder(undefined, input, 'device');
    vi.setSystemTime(new Date('2026-10-06T16:00:00Z'));
    const { order } = await createOrder(undefined, input, 'device');
    expect(order.deviceOrderDate).toBe('2026-10-07');
  });
  it('allows a different event on the same day', async () => {
    await createOrder(undefined, input, 'device'); eventId = 'event-b';
    await createOrder(undefined, input, 'device'); expect(rows).toHaveLength(2);
  });
  it('allows repeat orders after disabling the limit despite an earlier dated order', async () => {
    await createOrder(undefined, input, 'device'); settings.deviceOrderLimitEnabled = false;
    await createOrder(undefined, input, 'device'); await createOrder(undefined, input, 'device');
    expect(rows.map(row => row.deviceOrderDate)).toEqual(['2026-10-06', null, null]);
  });
  it('translates the database race backstop into a friendly error', async () => {
    mocks.order.create.mockRejectedValueOnce(duplicate());
    await expect(createOrder(undefined, input, 'device')).rejects.toMatchObject({
      code: 'DEVICE_ORDER_EXISTS', message: 'This device has already placed an order for this event today.',
    });
  });
  it('does not mislabel unrelated unique violations', async () => {
    const error = duplicate(['eventId', 'eventOrderNumber']); mocks.order.create.mockRejectedValueOnce(error);
    await expect(createOrder(undefined, input, 'device')).rejects.toBe(error);
  });
  it('preserves Max Drinks Per Order', async () => {
    await expect(createOrder(undefined, { ...input, items: [{ menuItemId: 'coffee', quantity: 3 }] }, 'device'))
      .rejects.toThrow('Maximum 2 item(s) per order.');
    expect(mocks.order.create).not.toHaveBeenCalled();
  });
  it.each([true, false])('preserves Daily Cup Limit with device limit %s', async (enabled) => {
    settings.deviceOrderLimitEnabled = enabled; settings.dailyLimitEnabled = true;
    mocks.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });
    await expect(createOrder(undefined, input, 'device')).rejects.toThrow('Ordering is closed because the cup limit has been reached.');
    expect(mocks.order.create).not.toHaveBeenCalled();
  });
});
