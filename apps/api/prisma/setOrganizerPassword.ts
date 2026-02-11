
import prisma from '../src/utils/prisma';
import { hashPassword } from '../src/utils/password';

const EMAIL = 'l6613390@gmail.com';
const NEW_PASSWORD = 'password123';

async function main() {
  const normalizedEmail = EMAIL.trim().toLowerCase();
  console.log(`[Admin] Resetting password for: ${normalizedEmail}`);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    console.error(`[Admin] User not found: ${normalizedEmail}`);
    process.exit(1);
  }

  const hashedPassword = await hashPassword(NEW_PASSWORD);

  await prisma.user.update({
    where: { email: normalizedEmail },
    data: { password: hashedPassword },
  });

  console.log(`[Admin] Password updated successfully for: ${normalizedEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
