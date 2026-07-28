import { EventStatus, OrderingStatus, OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { generateEventOrdersExcel } from './excel.service';

export const ACTIVE_EVENT_CONFLICT_MESSAGE =
  'There is already an active event. Please complete the current event before activating a new event.';
export const ORDERING_CLOSED_MESSAGE =
  'Ordering is currently closed. Please wait for the next ordering session or contact our staff.';
export const ORDER_LIMIT_REACHED_MESSAGE =
  'Ordering is closed because the cup limit has been reached.';

const eventInputSchema = z.object({
  eventName: z.string().trim().min(1, 'Event name is required.').max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date is required.'),
  location: z.string().trim().max(240).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

async function vendorForUser(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new Error('Vendor profile not found');
  return vendor;
}

function dateOnly(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Event date is invalid.');
  }
  return parsed;
}

function effectiveOrderingStatus(event: any, totalCups: number, settings?: any): OrderingStatus {
  if (settings === undefined) return event.orderingStatus;
  if (event.orderingStatus === OrderingStatus.MANUALLY_CLOSED) return OrderingStatus.MANUALLY_CLOSED;
  const limitEnabled = settings?.dailyLimitEnabled === true;
  const limit = Number(settings?.dailyLimitQuantity || 0);
  if (limitEnabled && limit > 0 && totalCups >= limit) return OrderingStatus.LIMIT_REACHED;
  return OrderingStatus.OPEN;
}

async function summaryForEvent(event: any, settings?: any) {
  const [orders, cups] = await Promise.all([
    prisma.order.aggregate({
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { eventId: event.id } },
      _sum: { quantity: true },
    }),
  ]);
  const totalCups = Number(cups._sum.quantity || 0);
  const orderingStatus = effectiveOrderingStatus(event, totalCups, settings);
  if (event.status === EventStatus.ACTIVE && orderingStatus !== event.orderingStatus) {
    await prisma.event.update({ where: { id: event.id }, data: { orderingStatus } });
  }
  return {
    ...event,
    orderingStatus,
    totalOrders: orders._count._all,
    totalCups,
    cupLimitEnabled: settings?.dailyLimitEnabled === true,
    expectedCupQuantity: Number(settings?.dailyLimitQuantity || 0),
  };
}

export async function getCurrentEvent(userId: string) {
  const vendor = await vendorForUser(userId);
  const [event, settings] = await Promise.all([prisma.event.findFirst({
    where: { vendorId: vendor.id, status: EventStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
  }), prisma.vendorSettings.findUnique({ where: { vendorId: vendor.id } })]);
  return event ? summaryForEvent(event, settings) : null;
}

export async function listEventHistory(userId: string, includeArchived = false) {
  const vendor = await vendorForUser(userId);
  const events = await prisma.event.findMany({
    where: {
      vendorId: vendor.id,
      status: includeArchived
        ? { in: [EventStatus.COMPLETED, EventStatus.ARCHIVED] }
        : EventStatus.COMPLETED,
    },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
  });
  return Promise.all(events.map(summaryForEvent));
}

export async function createAndActivateEvent(userId: string, raw: unknown) {
  const input = eventInputSchema.parse(raw);
  const vendor = await vendorForUser(userId);
  const active = await prisma.event.findFirst({
    where: { vendorId: vendor.id, status: EventStatus.ACTIVE },
    select: { id: true },
  });
  if (active) throw new Error(ACTIVE_EVENT_CONFLICT_MESSAGE);

  try {
    const event = await prisma.event.create({
      data: {
        vendorId: vendor.id,
        eventName: input.eventName,
        eventDate: dateOnly(input.eventDate),
        location: input.location || null,
        notes: input.notes || null,
        status: EventStatus.ACTIVE,
        orderingStatus: OrderingStatus.OPEN,
        nextOrderNumber: 1,
      },
    });
    return summaryForEvent(event);
  } catch (error: any) {
    if (error?.code === 'P2002') throw new Error(ACTIVE_EVENT_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function updateEvent(userId: string, eventId: string, raw: unknown) {
  const input = eventInputSchema.parse(raw);
  const vendor = await vendorForUser(userId);
  const existing = await prisma.event.findFirst({ where: { id: eventId, vendorId: vendor.id } });
  if (!existing) throw new Error('Event not found.');
  if (existing.status === EventStatus.ARCHIVED) throw new Error('Archived events cannot be edited.');
  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      eventName: input.eventName,
      eventDate: dateOnly(input.eventDate),
      location: input.location || null,
      notes: input.notes || null,
    },
  });
  return summaryForEvent(event);
}

export async function completeEvent(userId: string, eventId: string) {
  const vendor = await vendorForUser(userId);
  const result = await prisma.event.updateMany({
    where: { id: eventId, vendorId: vendor.id, status: EventStatus.ACTIVE },
    data: { status: EventStatus.COMPLETED, completedAt: new Date() },
  });
  if (result.count === 0) throw new Error('Active event not found.');
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  return summaryForEvent(event);
}

export async function updateOrderingStatus(userId: string, eventId: string, raw: unknown) {
  const input = z.object({
    orderingStatus: z.enum([OrderingStatus.OPEN, OrderingStatus.MANUALLY_CLOSED]),
  }).parse(raw);
  const vendor = await vendorForUser(userId);
  const event = await prisma.event.findFirst({
    where: { id: eventId, vendorId: vendor.id, status: EventStatus.ACTIVE },
  });
  if (!event) throw new Error('Active event not found.');
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { orderingStatus: input.orderingStatus },
  });
  const settings = await prisma.vendorSettings.findUnique({ where: { vendorId: vendor.id } });
  return summaryForEvent(updated, settings);
}

export async function archiveEvent(userId: string, eventId: string) {
  const vendor = await vendorForUser(userId);
  const result = await prisma.event.updateMany({
    where: { id: eventId, vendorId: vendor.id, status: EventStatus.COMPLETED },
    data: { status: EventStatus.ARCHIVED },
  });
  if (result.count === 0) throw new Error('Only completed events can be archived.');
  return { id: eventId };
}

async function ownedEvent(userId: string, eventId: string) {
  const vendor = await vendorForUser(userId);
  const event = await prisma.event.findFirst({ where: { id: eventId, vendorId: vendor.id } });
  if (!event) throw new Error('Event not found.');
  return event;
}

export async function getEventOrders(
  userId: string,
  eventId: string,
  filters: { status?: string; search?: string } = {},
) {
  const event = await ownedEvent(userId, eventId);
  const status = filters.status && Object.values(OrderStatus).includes(filters.status as OrderStatus)
    ? filters.status as OrderStatus
    : undefined;
  const search = String(filters.search || '').trim();
  const numericSearch = /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : null;
  const where: Prisma.OrderWhereInput = {
    eventId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            ...(numericSearch !== null ? [{ eventOrderNumber: numericSearch }] : []),
            { customerName: { contains: search, mode: 'insensitive' } },
            { customerPhone: { contains: search, mode: 'insensitive' } },
            { customerEmail: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    include: { items: { include: { menuItem: { select: { name: true } } } } },
    orderBy: { eventOrderNumber: 'asc' },
  });
  const summary = await summaryForEvent(event);
  return { event: summary, orders };
}

export async function exportEventExcel(userId: string, eventId: string) {
  const result = await getEventOrders(userId, eventId);
  return generateEventOrdersExcel(result.event, result.orders);
}
