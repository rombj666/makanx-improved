import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ vendor: vi.fn(), orders: vi.fn() }));
vi.mock('../utils/prisma', () => ({ default: {
  vendorProfile: { findUnique: mocks.vendor },
  order: { findMany: mocks.orders },
} }));
import { vendorProductPerformance, vendorRevenueTrend, vendorSalesSummary } from '../controllers/analytics.controller';

const orders = [
  { id: 'one', eventOrderNumber: 1, displayNumber: 1, totalAmount: new Prisma.Decimal('0.30'),
    createdAt: new Date('2026-10-04T01:00:00Z'), completedAt: new Date(),
    items: [{ menuItemId: 'coffee', quantity: 1, price: new Prisma.Decimal('0.10'), remark: null, selectedOptions: [], menuItem: { name: 'Coffee' } },
      { menuItemId: 'coffee', quantity: 1, price: new Prisma.Decimal('0.20'), remark: null, selectedOptions: [], menuItem: { name: 'Coffee' } }] },
  { id: 'two', eventOrderNumber: 2, displayNumber: 2, totalAmount: new Prisma.Decimal('0.60'),
    createdAt: new Date('2026-10-04T01:30:00Z'), completedAt: new Date(),
    items: [{ menuItemId: 'coffee', quantity: 3, price: new Prisma.Decimal('0.20'), remark: null, selectedOptions: [], menuItem: { name: 'Coffee' } }] },
];
beforeEach(() => {
  mocks.vendor.mockResolvedValue({ id: 'vendor' });
  mocks.orders.mockResolvedValue(orders);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
function invoke(handler: any) {
  let body: any;
  const req = { user: { userId: 'staff' }, query: { date: '2026-10-04' } };
  const res = { json: (value: any) => { body = value; }, status: () => res };
  return handler(req, res).then(() => body);
}
describe('analytics decimal totals', () => {
  it('returns exact summary, product, and hourly totals', async () => {
    expect((await invoke(vendorSalesSummary)).data).toEqual({ orders: 2, revenue: 0.9, avgOrder: 0.45 });
    expect((await invoke(vendorProductPerformance)).data[0]).toMatchObject({ qtySold: 5, revenue: 0.9 });
    const trend = (await invoke(vendorRevenueTrend)).data;
    expect(trend.reduce((sum: number, bucket: any) => sum + bucket.revenue, 0)).toBe(0.9);
  });
});
