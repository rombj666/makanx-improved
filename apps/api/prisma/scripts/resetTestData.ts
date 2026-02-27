import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetTestData() {
  console.log('🧹 Starting test data cleanup...');

  try {
    // Step 1: Delete OrderItems first (foreign key constraint)
    const orderItemsResult = await prisma.orderItem.deleteMany({});
    console.log(`✅ Deleted ${orderItemsResult.count} order items`);

    // Step 2: Delete Orders
    const ordersResult = await prisma.order.deleteMany({});
    console.log(`✅ Deleted ${ordersResult.count} orders`);

    // Step 3: Delete guest users only
    const guestUsersResult = await prisma.user.deleteMany({
      where: {
        OR: [
          { name: 'Guest' },
          { email: { startsWith: 'guest+' } }
        ]
      }
    });
    console.log(`✅ Deleted ${guestUsersResult.count} guest users`);

    console.log('🎉 Test data cleanup completed successfully!');
    
    // Show remaining user count for verification
    const remainingUsers = await prisma.user.count();
    console.log(`📊 Remaining users: ${remainingUsers}`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
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