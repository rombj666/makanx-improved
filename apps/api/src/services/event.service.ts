import { EventStatus, OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { generateEventOrdersExcel } from './excel.service';

export const ACTIVE_EVENT_CONFLICT_MESSAGE =
  'There is already an active event. Please complete the current event before activating a new event.';
export const ORDERING_CLOSED_MESSAGE =
  'Ordering is currently closed. Please wait for the next ordering session or contact our staff.';

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

async function summaryForEvent(event: any) {
  const [orders, cups] = await Promise.all([
    prisma.order.aggregate({
      where: { eventId: event.id },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { eventId: event.id } },
      _sum: { quantity: true },
    }),
  ]);
  return {
    ...event,
    totalOrders: orders._count._all,
    totalCups: Number(cups._sum.quantity || 0),
    totalSales: Number(orders._sum.totalAmount || 0),
  };
}

export async function getCurrentEvent(userId: string) {
  const vendor = await vendorForUser(userId);
  const event = await prisma.event.findFirst({
    where: { vendorId: vendor.id, status: EventStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
  });
  return event ? summaryForEvent(event) : null;
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

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function itemSummary(order: any) {
  return order.items.map((item: any) => `${item.quantity}x ${item.menuItem.name}`).join(' | ');
}

export async function exportEventCsv(userId: string, eventId: string) {
  const { event, orders } = await getEventOrders(userId, eventId);
  const headers = [
    'Event name', 'Event date', 'Event location', 'Event order number', 'Customer name',
    'Customer phone', 'Customer email', 'Ordered items', 'Total cups', 'Total amount',
    'Payment status', 'Preparation status', 'Order status', 'Created time',
  ];
  const rows = orders.map((order: any) => [
    event.eventName,
    event.eventDate.toISOString().slice(0, 10),
    event.location || '',
    order.eventOrderNumber,
    order.customerName || '',
    order.customerPhone || '',
    order.customerEmail || '',
    itemSummary(order),
    order.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
    Number(order.totalAmount).toFixed(2),
    order.paymentStatus,
    order.items.map((item: any) => `${item.menuItem.name}: ${item.status}`).join(' | '),
    order.status,
    order.createdAt.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export async function exportEventExcel(userId: string, eventId: string) {
  const result = await getEventOrders(userId, eventId);
  return generateEventOrdersExcel(result.event, result.orders);
}
