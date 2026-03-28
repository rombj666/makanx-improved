const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const menuCols = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='MenuItem' AND column_name IN ('optionGroups','remarksEnabled') ORDER BY column_name"
    );
    const orderItemCols = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='OrderItem' AND column_name IN ('selectedOptions') ORDER BY column_name"
    );
    const counts = await prisma.$queryRawUnsafe(
      'SELECT \'MenuItem\' AS table_name, COUNT(*)::int AS row_count FROM \"MenuItem\" ' +
        'UNION ALL SELECT \'Order\' AS table_name, COUNT(*)::int AS row_count FROM \"Order\" ' +
        'UNION ALL SELECT \'OrderItem\' AS table_name, COUNT(*)::int AS row_count FROM \"OrderItem\"'
    );

    console.log(JSON.stringify({ menuCols, orderItemCols, counts }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

