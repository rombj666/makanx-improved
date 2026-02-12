
import dotenv from "dotenv";
dotenv.config();

import prisma from '../src/utils/prisma';

async function main() {
  const MAP_URL = '/maps/sg-food-fest-2026.jpg';
  console.log(`[Admin] Updating Singapore Food Festival 2026 map to: ${MAP_URL}`);

  // Find event by name (case insensitive ideally, but name is specific)
  // Or update ALL events that have mapImageUrl starting with /uploads/ to use the static one for now?
  // User said "Singapore Food Festival 2026".

  const event = await prisma.event.findFirst({
    where: {
      name: { contains: 'Singapore Food Festival', mode: 'insensitive' }
    }
  });

  if (!event) {
    console.log('[Admin] Event "Singapore Food Festival" not found.');
    // List events to help
    const events = await prisma.event.findMany({ select: { id: true, name: true } });
    console.log('[Admin] Available events:', events);
    return;
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { mapImageUrl: MAP_URL }
  });

  console.log(`[Admin] Updated event ${event.id} (${event.name}) mapImageUrl to ${MAP_URL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
