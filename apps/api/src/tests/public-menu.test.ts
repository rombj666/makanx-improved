import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  vendor: vi.fn(), aggregate: vi.fn(), updateMany: vi.fn(),
}));
vi.mock('../utils/prisma', () => ({ default: {
  vendorProfile: { findUnique: mocks.vendor },
  orderItem: { aggregate: mocks.aggregate },
  event: { updateMany: mocks.updateMany },
} }));
import { getPublicMenu, getPublicMenuBySlug } from '../services/menu.service';

const internalSettings = {
  showPrices: false,
  deviceOrderLimitEnabled: true,
  maxDrinksPerOrder: 3,
  dailyLimitEnabled: true,
  dailyLimitQuantity: 100,
  dailyLimitAutoStop: true,
  reportRecipientEmails: ['private@example.test'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.vendor.mockResolvedValue({
    id: 'vendor', slug: 'cafe', businessName: 'Cafe', description: 'Public description',
    settings: internalSettings,
    events: [{ id: 'event', eventName: 'Today', eventDate: new Date('2026-10-04'), orderingStatus: 'OPEN' }],
    menuItems: [{
      id: 'item', name: 'Coffee', description: 'Fresh', price: new Prisma.Decimal('0.30'),
      imageUrl: 'https://example.test/coffee.webp', remarksEnabled: true,
      optionGroups: [{ id: 'size', title: 'Size', type: 'single', required: true,
        choices: [{ id: 'large', label: 'Large', priceDelta: 0.2 }] }],
    }],
  });
  mocks.aggregate.mockResolvedValue({ _sum: { quantity: 2 } });
  mocks.updateMany.mockResolvedValue({ count: 0 });
});

describe('public menu DTO', () => {
  it.each([
    ['id', () => getPublicMenu('vendor')],
    ['slug', () => getPublicMenuBySlug('cafe')],
  ])('uses one minimized shape for %s lookup', async (_kind, load) => {
    const result: any = await load();
    expect(result).toMatchObject({
      id: 'vendor', slug: 'cafe', businessName: 'Cafe', description: 'Public description',
      activeEvent: { eventName: 'Today' },
      settings: { showPrices: false, orderingOpen: true, orderingStatus: 'OPEN', maxDrinksPerOrder: 3 },
    });
    expect(result.activeEvent).not.toHaveProperty('id');
    for (const key of ['dailyLimitEnabled', 'dailyLimitQuantity', 'dailyLimitAutoStop', 'deviceOrderLimitEnabled', 'reportRecipientEmails']) {
      expect(result.settings).not.toHaveProperty(key);
    }
    expect(result.menuItems[0]).not.toHaveProperty('price');
    expect(result.menuItems[0].optionGroups[0].choices[0]).not.toHaveProperty('priceDelta');
  });

  it('returns public prices only when display is enabled', async () => {
    mocks.vendor.mockResolvedValueOnce({ ...(await mocks.vendor()), settings: { ...internalSettings, showPrices: true } });
    const result: any = await getPublicMenu('vendor');
    expect(result.menuItems[0].price).toBe(0.3);
    expect(result.menuItems[0].optionGroups[0].choices[0].priceDelta).toBe(0.2);
  });
});
