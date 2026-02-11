import prisma from '../utils/prisma';
import { z } from 'zod';

const eventSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  location: z.string().optional(),
  mapImageUrl: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

const createSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
};

export const createEvent = async (organizerId: string, input: z.infer<typeof eventSchema>) => {
  const data = eventSchema.parse(input);
  const slug = createSlug(data.name);

  return prisma.event.create({
    data: {
      ...data,
      slug,
      organizerId,
    },
  });
};

export const updateEvent = async (id: string, organizerId: string, input: Partial<z.infer<typeof eventSchema>>) => {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) throw new Error('Unauthorized to update this event');

  const data = eventSchema.partial().parse(input);
  
  return prisma.event.update({
    where: { id },
    data,
  });
};

export const deleteEvent = async (id: string, organizerId: string) => {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) throw new Error('Unauthorized to delete this event');

  return prisma.event.delete({ where: { id } });
};

export const getEvents = async (status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') => {
  return prisma.event.findMany({
    where: { status },
    orderBy: { startDate: 'asc' },
  });
};

export const archiveEvent = async (id: string, organizerId: string) => {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) throw new Error('Unauthorized');

  return prisma.event.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  });
};

export const unarchiveEvent = async (id: string, organizerId: string) => {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new Error('Event not found');
  if (event.organizerId !== organizerId) throw new Error('Unauthorized');

  return prisma.event.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
};

export const getEventBySlug = async (slug: string) => {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: { 
      booths: {
        include: {
          vendor: {
            include: {
              menuItems: true
            }
          }
        }
      } 
    },
  });
  if (!event) throw new Error('Event not found');
  return event;
};
