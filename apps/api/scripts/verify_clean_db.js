/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function malaysiaRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 8 * 60 * 60 * 1000),
    end: new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 8 * 60 * 60 * 1000),
  };
}

async function main() {
  const counts = {
    users: await prisma.user.count(),
    vendors: await prisma.vendorProfile.count(),
    menuItems: await prisma.menuItem.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
  };

  const hourCoffee = await prisma.vendorProfile.findFirst({
    where: {
      OR: [
        { slug: 'hour-coffee' },
        { businessName: { equals: 'Hour Coffee', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      slug: true,
      businessName: true,
      user: { select: { email: true, isActive: true } },
      settings: {
        select: {
          orderingOpen: true,
          showPrices: true,
          deviceOrderLimitEnabled: true,
          maxDrinksPerOrder: true,
        },
      },
      menuItems: {
        where: { isAvailable: true },
        select: { id: true, name: true, price: true, optionGroups: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  const { start, end } = malaysiaRange('2026-06-12');
  const june12Orders = hourCoffee
    ? await prisma.order.count({
        where: {
          vendorId: hourCoffee.id,
          paymentStatus: 'PAID',
          status: 'READY',
          createdAt: { gte: start, lt: end },
        },
      })
    : 0;
  const june12Items = hourCoffee
    ? await prisma.orderItem.count({
        where: {
          order: {
            vendorId: hourCoffee.id,
            paymentStatus: 'PAID',
            status: 'READY',
            createdAt: { gte: start, lt: end },
          },
        },
      })
    : 0;

  console.log(JSON.stringify({
    counts,
    hourCoffee: hourCoffee
      ? {
          id: hourCoffee.id,
          slug: hourCoffee.slug,
          businessName: hourCoffee.businessName,
          loginEmail: hourCoffee.user.email,
          isActive: hourCoffee.user.isActive,
          orderingOpen: hourCoffee.settings?.orderingOpen,
          activeMenuItems: hourCoffee.menuItems.length,
          sampleMenuItems: hourCoffee.menuItems.slice(0, 5).map((item) => ({
            name: item.name,
            price: String(item.price),
            optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups.length : 0,
          })),
        }
      : null,
    customerPath: hourCoffee ? `/v/${hourCoffee.slug}` : null,
    june12SalesHistory: { orders: june12Orders, orderItems: june12Items },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[verify] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
