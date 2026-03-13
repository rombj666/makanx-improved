import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  const email = 'organizer@makanx.test';
  const name = 'sample organizer';
  const password = await hashPassword('password');

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      password,
      role: 'ORGANIZER',
      isActive: true,
    },
    update: {
      name,
      password,
      role: 'ORGANIZER',
      isActive: true,
    },
  });

  console.log(`Seeded organizer: ${user.email}`);
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
