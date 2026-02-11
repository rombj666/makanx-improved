import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean up
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.booth.deleteMany();
  await prisma.vendorApplication.deleteMany();
  await prisma.event.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.user.deleteMany();

  // Create Users
  const password = await bcrypt.hash('password123', 10);

  const organizer = await prisma.user.create({
    data: {
      email: 'organizer@makanx.com',
      password,
      name: 'Organizer One',
      role: 'ORGANIZER',
    },
  });

  const vendorUser = await prisma.user.create({
    data: {
      email: 'vendor@makanx.com',
      password,
      name: 'Vendor One',
      role: 'VENDOR',
    },
  });

  const customer = await prisma.user.create({
    data: {
      email: 'customer@makanx.com',
      password,
      name: 'Customer One',
      role: 'CUSTOMER',
    },
  });

  // Create Vendor Profile
  await prisma.vendorProfile.create({
    data: {
      userId: vendorUser.id,
      businessName: 'Satay Bros',
      description: 'Best Satay in town',
    },
  });

  // Create Event
  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      name: 'Singapore Food Festival 2026',
      slug: 'sg-food-fest-2026',
      description: 'The biggest food event of the year',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      location: 'Bayfront Event Space',
    },
  });

  // Create Booths
  await prisma.booth.createMany({
    data: [
      { eventId: event.id, name: 'A01', status: 'AVAILABLE' },
      { eventId: event.id, name: 'A02', status: 'AVAILABLE' },
      { eventId: event.id, name: 'B01', status: 'OCCUPIED' },
    ],
  });

  console.log('Seeding completed.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
