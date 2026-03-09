
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up PENDING orders...');
  try {
    // Use executeRawUnsafe to bypass Prisma enum validation since PENDING might be removed from the enum definition
    const result = await prisma.$executeRawUnsafe(`DELETE FROM "Order" WHERE "status" = 'PENDING'`);
    console.log(`Deleted PENDING orders (count: ${result})`);
  } catch (error) {
    console.error('Error deleting PENDING orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
