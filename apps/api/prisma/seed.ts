import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  const email = 'vendor@test.com';
  const password = 'password';
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Test Vendor',
      password: passwordHash,
      role: Role.VENDOR,
      vendorProfile: {
        create: {
          businessName: 'Demo Coffee Store',
          description: 'Fresh drinks ordered directly by QR code.',
          category: 'Beverages',
          settings: { create: {} },
          menuItems: {
            create: [
              { name: 'Americano', description: 'Espresso and water', price: 8, displayOrder: 1 },
              { name: 'Latte', description: 'Espresso and milk', price: 10, displayOrder: 2 },
            ],
          },
        },
      },
    },
    update: {
      name: 'Test Vendor',
      password: passwordHash,
      role: Role.VENDOR,
      isActive: true,
    },
  });

  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: user.id } });
  if (vendor) {
    await prisma.vendorSettings.upsert({
      where: { vendorId: vendor.id },
      create: { vendorId: vendor.id },
      update: {},
    });
  }

  console.log('Smart QR Ordering System seed complete');
  console.log(`Vendor login: ${email} / ${password}`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
