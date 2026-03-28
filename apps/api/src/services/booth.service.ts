import prisma from '../utils/prisma';
import { z } from 'zod';

const boothSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().min(1),
  status: z.string().default('AVAILABLE'),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  vendorId: z.string().uuid().optional().nullable(),
});

const bulkUpdateSchema = z.object({
  eventId: z.string().uuid(),
  booths: z.array(z.object({
    id: z.string().uuid(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })),
  mapImageUrl: z.string().optional(),
});

export const createBooth = async (organizerId: string, input: z.infer<typeof boothSchema>) => {
  const data = boothSchema.parse(input);

  const event = await prisma.event.findUnique({ where: { id: data.eventId } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    err.meta = {
      reason: 'event_owner_mismatch',
      userId: organizerId,
      eventId: data.eventId,
      eventOrganizerId: event.organizerId,
    };
    throw err;
  }

  return prisma.booth.create({
    data,
  });
};

export const updateBooth = async (id: string, organizerId: string, input: Partial<z.infer<typeof boothSchema>>) => {
  const booth = await prisma.booth.findUnique({ 
    where: { id },
    include: { event: true } 
  });
  
  if (!booth) throw new Error('Booth not found');
  if (booth.event.organizerId !== organizerId) {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    err.meta = {
      reason: 'event_owner_mismatch',
      userId: organizerId,
      boothId: id,
      boothEventId: booth.eventId,
      eventOrganizerId: booth.event.organizerId,
    };
    throw err;
  }

  const data = boothSchema.partial().parse(input);

  return prisma.booth.update({
    where: { id },
    data,
  });
};

export const deleteBooth = async (id: string, organizerId: string) => {
  const booth = await prisma.booth.findUnique({ 
    where: { id },
    include: { event: true } 
  });
  
  if (!booth) throw new Error('Booth not found');
  if (booth.event.organizerId !== organizerId) {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    err.meta = {
      reason: 'event_owner_mismatch',
      userId: organizerId,
      boothId: id,
      boothEventId: booth.eventId,
      eventOrganizerId: booth.event.organizerId,
    };
    throw err;
  }

  return prisma.booth.delete({ where: { id } });
};

export const getBoothsByEvent = async (eventId: string) => {
  return prisma.booth.findMany({ where: { eventId } });
};

export const updateEventLayout = async (organizerId: string, input: z.infer<typeof bulkUpdateSchema>) => {
  const { eventId, booths, mapImageUrl } = bulkUpdateSchema.parse(input);

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) {
    const err: any = new Error('Forbidden');
    err.statusCode = 403;
    err.meta = {
      reason: 'event_owner_mismatch',
      userId: organizerId,
      eventId,
      eventOrganizerId: event.organizerId,
    };
    throw err;
  }

  // Update Map Image if provided
  if (mapImageUrl) {
    await prisma.event.update({
      where: { id: eventId },
      data: { mapImageUrl, layoutVersion: { increment: 1 } },
    });
  } else {
    await prisma.event.update({
      where: { id: eventId },
      data: { layoutVersion: { increment: 1 } },
    });
  }

  // Bulk update booths
  const updates = booths.map((b) => 
    prisma.booth.update({
      where: { id: b.id },
      data: { x: b.x, y: b.y, width: b.width, height: b.height },
    })
  );

  await prisma.$transaction(updates);

  return { success: true };
};
