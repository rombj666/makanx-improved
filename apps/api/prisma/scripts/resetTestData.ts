import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/utils/password';

const prisma = new PrismaClient();

async function resetTestData() {
  const email = 'organizer@makanx.test';
  const name = 'sample organizer';
  const password = await hashPassword('password');

  console.log('Starting database reset...');

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.menuItem.deleteMany();
      await tx.booth.deleteMany();
      await tx.inviteToken.deleteMany();
      await tx.vendorApplication.deleteMany();
      await tx.pushSubscription.deleteMany();
      await tx.passwordResetToken.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.event.deleteMany();
      await tx.vendorProfile.deleteMany();
      await tx.user.deleteMany({ where: { email: { not: email } } });
      await tx.user.upsert({
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
    });

    const counts = await Promise.all([
      prisma.user.count(),
      prisma.vendorProfile.count(),
      prisma.vendorApplication.count(),
      prisma.inviteToken.count(),
      prisma.event.count(),
      prisma.booth.count(),
      prisma.menuItem.count(),
      prisma.order.count(),
      prisma.orderItem.count(),
      prisma.pushSubscription.count(),
      prisma.passwordResetToken.count(),
      prisma.auditLog.count(),
    ]);

    console.log('Reset complete.');
    console.log(JSON.stringify({
      users: counts[0],
      vendorProfiles: counts[1],
      vendorApplications: counts[2],
      inviteTokens: counts[3],
      events: counts[4],
      booths: counts[5],
      menuItems: counts[6],
      orders: counts[7],
      orderItems: counts[8],
      pushSubscriptions: counts[9],
      passwordResetTokens: counts[10],
      auditLogs: counts[11],
    }));
  } catch (error) {
    console.error('Error during reset:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from database');
  }
}

// Run the script
if (require.main === module) {
  resetTestData()
    .then(() => {
      console.log('✨ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

export default resetTestData;
