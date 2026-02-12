
import dotenv from "dotenv";
dotenv.config();

import prisma from '../src/utils/prisma';

async function main() {
  console.log('[Migration] Starting migration of legacy /uploads/ map URLs...');

  // Find all events with mapImageUrl starting with /uploads/
  const events = await prisma.event.findMany({
    where: {
      mapImageUrl: {
        startsWith: '/uploads/'
      }
    },
    select: {
      id: true,
      name: true,
      mapImageUrl: true
    }
  });

  console.log(`[Migration] Found ${events.length} events with legacy map URLs.`);

  if (events.length === 0) {
    console.log('[Migration] No events to migrate.');
    return;
  }

  // Update each event
  for (const event of events) {
    console.log(`[Migration] Migrating event: ${event.id} (${event.name}) - URL: ${event.mapImageUrl}`);
    
    // We replace with null so the organizer is prompted to set a new map
    // Alternatively, we could set a default placeholder if we had one in Cloudinary
    await prisma.event.update({
      where: { id: event.id },
      data: { mapImageUrl: null }
    });
  }

  console.log('[Migration] Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
