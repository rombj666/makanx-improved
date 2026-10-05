import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const mocks = vi.hoisted(() => ({ orders: vi.fn(), excel: vi.fn() }));
vi.mock('../utils/prisma', () => ({ default: {
  vendorProfile: { findUnique: vi.fn(async () => ({ id: 'vendor' })) },
  event: { findFirst: vi.fn(async () => ({ id: 'event' })) },
  order: { findMany: mocks.orders, aggregate: vi.fn(async () => ({ _count: { _all: 2 } })) },
  orderItem: { aggregate: vi.fn(async () => ({ _sum: { quantity: 5 } })) },
} }));
vi.mock('../services/excel.service', () => ({ generateEventOrdersExcel: mocks.excel }));
import { vendorSalesSummary, vendorProductPerformance, vendorProductTrend, vendorCompletedOrders } from '../controllers/analytics.controller';
import { exportEventExcel } from '../services/event.service';
let rows: any[];
function order(id: string, status: string, paymentStatus: string, createdAt: string, quantity = 2) {
  return { id, vendorId: 'vendor', eventId: 'event', status, paymentStatus, eventOrderNumber: Number(id),
    createdAt: new Date(createdAt), completedAt: null, totalAmount: new Prisma.Decimal(quantity),
    items: [{ menuItemId: 'coffee', quantity, price: new Prisma.Decimal(1), remark: null,
      selectedOptions: [], menuItem: { name: 'Coffee' } }] };
}
beforeEach(() => {
  rows = [order('1', 'PREPARING', 'PENDING', '2026-10-03T16:00:00Z'),
    order('2', 'READY', 'PENDING', '2026-10-04T15:59:59Z', 3)];
  mocks.orders.mockImplementation(async ({ where }) => rows.filter(row =>
    (!where.vendorId || row.vendorId === where.vendorId) &&
    (!where.eventId || row.eventId === where.eventId) &&
    (!where.paymentStatus || row.paymentStatus === where.paymentStatus) &&
    (!where.status || where.status.in.includes(row.status)) &&
    (!where.createdAt || (row.createdAt >= where.createdAt.gte && row.createdAt < where.createdAt.lt))));
});
async function invoke(handler: any) {
  let body: any;
  const res = { json: (value: any) => { body = value; }, status: () => res };
  await handler({ user: { userId: 'staff' }, query: { date: '2026-10-04' } }, res);
  expect(body.success).toBe(true);
  return body.data;
}
describe('accepted order sales', () => {
  it('includes preparing and ready pending orders in every sales endpoint with item quantities', async () => {
    expect((await invoke(vendorSalesSummary)).orders).toBe(2);
    expect((await invoke(vendorProductPerformance))[0].qtySold).toBe(5);
    expect((await invoke(vendorProductTrend))[0].points.map((p: any) => p.qty)).toEqual([2, 3]);
    expect((await invoke(vendorCompletedOrders)).map((o: any) => o.orderNumber)).toEqual(['#1', '#2']);
    expect(mocks.orders.mock.calls[0][0].where).not.toHaveProperty('paymentStatus');
  });
  it('counts each order once after ready and regardless of payment status', async () => {
    expect((await invoke(vendorSalesSummary)).orders).toBe(2);
    rows[0].status = 'READY';
    expect((await invoke(vendorSalesSummary)).orders).toBe(2);
    rows[0].paymentStatus = 'PAID';
    expect((await invoke(vendorSalesSummary)).orders).toBe(2);
  });
  it('scopes accepted orders to the vendor and Malaysia calendar date', async () => {
    rows.push(order('3', 'PREPARING', 'PENDING', '2026-10-03T15:59:59Z'),
      order('4', 'READY', 'PENDING', '2026-10-04T16:00:00Z'));
    rows.push({ ...rows[0], id: 'other', vendorId: 'other' });
    expect((await invoke(vendorSalesSummary)).orders).toBe(2);
    expect(mocks.orders.mock.calls.at(-1)![0].where.status.in).toEqual(['PREPARING', 'READY']);
  });
  it('passes pending orders to event report generation', async () => {
    await exportEventExcel('staff', 'event');
    expect(mocks.excel).toHaveBeenCalledWith(expect.objectContaining({ id: 'event' }), rows);
    expect(mocks.orders.mock.calls.at(-1)![0].where).toEqual({ eventId: 'event' });
  });
});
