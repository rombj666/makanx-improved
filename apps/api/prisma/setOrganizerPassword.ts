
import dotenv from "dotenv";
dotenv.config();

import prisma from '../src/utils/prisma';
import { hashPassword } from '../src/utils/password';

const EMAIL = 'l6613390@gmail.com';
const TYPO_EMAIL = 'l6613390@gmial.com';
const NEW_PASSWORD = 'password123';

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  const maskedDbUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`[Admin] Connecting to DB: ${maskedDbUrl}`);

  const normalizedEmail = EMAIL.trim().toLowerCase();
  console.log(`[Admin] Resetting password for: ${normalizedEmail}`);

  // Debug: Check total users
  const count = await prisma.user.count();
  console.log(`[Admin] Total users in DB: ${count}`);
  
  // Try to find the user with correct email
  let user = await prisma.user.findFirst({
    where: { 
      email: { 
        equals: normalizedEmail, 
        mode: "insensitive" 
      } 
    }
  });

  // If not found, try finding the known typo version
  if (!user) {
    console.log(`[Admin] User not found with ${normalizedEmail}. Checking for typo '${TYPO_EMAIL}'...`);
    user = await prisma.user.findFirst({
        where: { 
          email: { 
            equals: TYPO_EMAIL, 
            mode: "insensitive" 
          } 
        }
      });
  }

  if (!user) {
    console.error(`[Admin] User not found: ${normalizedEmail} (or typo version)`);
    // List users to help debug
    const users = await prisma.user.findMany({ select: { email: true, role: true }, take: 10 });
    console.log('[Admin] Existing users:', users);
    process.exit(1);
  }

  console.log(`[Admin] Found user: ${user.email} (${user.role})`);

  const hashedPassword = await hashPassword(NEW_PASSWORD);

  // Update password AND correct the email if it was the typo version
  await prisma.user.update({
    where: { id: user.id }, // Use ID to ensure we update the correct record even if we change email
    data: { 
        password: hashedPassword,
        email: normalizedEmail // Ensure email is correct and normalized
    },
  });

  console.log(`[Admin] Password updated successfully for: ${normalizedEmail}`);
  if (user.email !== normalizedEmail) {
      console.log(`[Admin] Also corrected email from ${user.email} to ${normalizedEmail}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
