import { EventStatus, OrderStatus, PaymentMode, PaymentStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { getIO } from '../socket';
import { getMalaysiaDayRange, getMalaysiaTodayString } from '../utils/date';
import { ORDERING_CLOSED_MESSAGE } from './event.service';

const createOrderSchema = z.object({
  vendorId: z.string().min(1),
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
    remark: z.string().max(500).optional(),
    selectedOptions: z.array(z.object({
      groupId: z.string().min(1),
      choiceIds: z.array(z.string().min(1)),
    })).optional(),
  })).min(1),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.PAY_AT_COUNTER),
  guestId: z.string().min(1),
  deviceId: z.string().optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.union([z.string().email(), z.literal('')]).optional(),
});

function selectedOptionSnapshot(groups: any[], selected: { groupId: string; choiceIds: string[] }[] = []) {
  const selections = new Map(
    selected.map((selection) => [
      String(selection.groupId),
      Array.from(new Set(selection.choiceIds.map(String).filter(Boolean))),
    ]),
  );

  for (const group of groups) {
    const groupId = String(group?.id || '');
    const choiceIds = selections.get(groupId) || [];
    if (group?.required && choiceIds.length === 0) {
      throw new Error(`Please select an option for ${String(group?.title || 'required customization')}.`);
    }
    if (group?.type !== 'multi' && choiceIds.length > 1) {
      throw new Error(`${String(group?.title || 'Customization')} allows only one option.`);
    }
    const validIds = new Set(
      (Array.isArray(group?.choices) ? group.choices : []).map((choice: any) => String(choice?.id || '')),
    );
    if (choiceIds.some((choiceId) => !validIds.has(choiceId))) {
      throw new Error(`Invalid option selected for ${String(group?.title || 'customization')}.`);
    }
  }

  for (const groupId of selections.keys()) {
    if (!groups.some((group) => String(group?.id || '') === groupId)) {
      throw new Error('Invalid customization group selected.');
    }
  }

  return groups.flatMap((group) => {
    const groupId = String(group?.id || '');
    const choiceIds = selections.get(groupId) || [];
    if (choiceIds.length === 0) return [];
    const choices = Array.isArray(group?.choices)
      ? group.choices.filter((choice: any) => choiceIds.includes(String(choice?.id)))
      : [];
    return {
      groupId,
      title: String(group?.title || ''),
      choices: choices.map((choice: any) => ({
        id: String(choice.id),
        label: String(choice.label || ''),
        priceDelta: Number(choice.priceDelta || 0),
      })),
    };
  });
}

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new Error('Vendor profile not found');
  return vendor;
}

export async function createOrder(_customerId: string | undefined, input: unknown) {
  const parsed = createOrderSchema.parse(input);
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: parsed.vendorId },
    include: { settings: true },
  });
  if (!vendor) throw new Error('Store not found');
  const settings = vendor.settings;
  const activeEvent = await prisma.event.findFirst({
    where: { vendorId: vendor.id, status: EventStatus.ACTIVE },
    select: { id: true },
  });
  if (!activeEvent) throw new Error(ORDERING_CLOSED_MESSAGE);

  const requestedQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
  if (settings?.deviceOrderLimitEnabled) {
    if (!parsed.deviceId) throw new Error('Device ID is required.');
    if (requestedQuantity > settings.maxDrinksPerOrder) {
      throw new Error(`Maximum ${settings.maxDrinksPerOrder} item(s) per order.`);
    }
    const { start, end } = getMalaysiaDayRange(getMalaysiaTodayString());
    const existing = await prisma.order.findFirst({
      where: { vendorId: vendor.id, eventId: activeEvent.id, deviceId: parsed.deviceId, createdAt: { gte: start, lt: end } },
      select: { id: true },
    });
    if (existing) {
      const error = new Error('This device has already placed an order today.');
      (error as any).code = 'DEVICE_ORDER_EXISTS';
      (error as any).existingOrderId = existing.id;
      throw error;
    }
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: parsed.items.map((item) => item.menuItemId) }, vendorId: vendor.id, isAvailable: true },
  });
  if (menuItems.length !== new Set(parsed.items.map((item) => item.menuItemId)).size) {
    throw new Error('One or more menu items are unavailable.');
  }

  const preparedItems = parsed.items.map((item) => {
    const menuItem = menuItems.find((candidate) => candidate.id === item.menuItemId)!;
    const groups = Array.isArray(menuItem.optionGroups) ? menuItem.optionGroups as any[] : [];
    const snapshot = selectedOptionSnapshot(groups, item.selectedOptions);
    const extras = snapshot.flatMap((group) => group.choices).reduce((sum, choice) => sum + choice.priceDelta, 0);
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: Number(menuItem.price) + extras,
      remark: item.remark?.trim() || null,
      selectedOptions: snapshot,
    };
  });
  const totalAmount = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = await prisma.$transaction(async (tx) => {
    const numberedEvents = await tx.$queryRaw<Array<{ id: string; eventOrderNumber: number }>>(Prisma.sql`
      UPDATE "Event"
      SET "nextOrderNumber" = "nextOrderNumber" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${activeEvent.id}
        AND "vendorId" = ${vendor.id}
        AND "status" = 'ACTIVE'
      RETURNING "id", "nextOrderNumber" - 1 AS "eventOrderNumber"
    `);
    const numberedEvent = numberedEvents[0];
    if (!numberedEvent) throw new Error(ORDERING_CLOSED_MESSAGE);
    return tx.order.create({
      data: {
        customerId: parsed.guestId,
        customerName: parsed.customerName?.trim() || null,
        customerPhone: parsed.customerPhone?.trim() || null,
        customerEmail: parsed.customerEmail?.trim() || null,
        deviceId: parsed.deviceId || null,
        vendorId: vendor.id,
        eventId: numberedEvent.id,
        eventOrderNumber: numberedEvent.eventOrderNumber,
        displayNumber: numberedEvent.eventOrderNumber,
        paymentMode: parsed.paymentMode,
        totalAmount,
        items: { create: preparedItems },
      },
      include: {
        items: { include: { menuItem: true } },
        event: { select: { eventName: true } },
        vendor: { select: { businessName: true, slug: true } },
      },
    });
  });

  getIO().to(`vendor:${vendor.id}`).emit('order_created', order);
  return { order, estimatedMinutes: Math.max(...menuItems.map((item) => item.basePrepMin), 5) };
}

export async function createOrderForVendorSlug(slug: string, input: unknown) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!vendor) throw new Error('Store not found');
  return createOrder(undefined, { ...(input as any), vendorId: vendor.id });
}

export async function getVendorOrders(userId: string) {
  const vendor = await getVendorForUser(userId);
  return prisma.order.findMany({
    where: { vendorId: vendor.id },
    include: { items: { include: { menuItem: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export const getVendorLiveOrders = getVendorOrders;

export async function getVendorProductionBatch(vendorId: string, _groupByWindow: boolean) {
  return prisma.order.findMany({
    where: { vendorId, status: OrderStatus.PREPARING },
    include: { items: { include: { menuItem: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getOrderById(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { menuItem: true } },
      event: { select: { eventName: true } },
      vendor: { select: { businessName: true, slug: true } },
    },
  });
}

export async function getCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function assertOrderOwner(orderId: string, userId: string) {
  const vendor = await getVendorForUser(userId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, vendorId: vendor.id },
    include: { items: true },
  });
  if (!order) throw new Error('Order not found');
  return { vendor, order };
}

async function notifyOrder(orderId: string) {
  const order = await getOrderById(orderId);
  if (order) {
    getIO().to(`user:${order.customerId}`).emit('order_updated', order);
    getIO().to(`vendor:${order.vendorId}`).emit('order_updated', order);
  }
  return order;
}

export async function updateOrderStatus(orderId: string, userId: string, status: OrderStatus) {
  await assertOrderOwner(orderId, userId);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(status === OrderStatus.READY
        ? { readyAt: new Date(), completedAt: new Date(), paymentStatus: PaymentStatus.PAID }
        : {}),
    },
  });
  return notifyOrder(orderId);
}

export async function markOrderItemReady(userId: string, orderId: string, itemId: string) {
  const { order } = await assertOrderOwner(orderId, userId);
  if (!order.items.some((item) => item.id === itemId)) throw new Error('Item not found');
  await prisma.orderItem.update({ where: { id: itemId }, data: { status: 'READY' } });
  const remaining = await prisma.orderItem.count({ where: { orderId, status: 'PREPARING' } });
  if (remaining === 0) await updateOrderStatus(orderId, userId, OrderStatus.READY);
  return notifyOrder(orderId);
}

export async function markOrderItemsReady(userId: string, orderId: string) {
  await assertOrderOwner(orderId, userId);
  await prisma.orderItem.updateMany({ where: { orderId }, data: { status: 'READY' } });
  return updateOrderStatus(orderId, userId, OrderStatus.READY);
}

export async function markBatchItemsReady(
  userId: string,
  menuItemId: string,
  windowStartISO: string,
  windowEndISO: string,
  selectedOptions?: any[],
  remark?: string,
) {
  const vendor = await getVendorForUser(userId);
  const result = await prisma.orderItem.updateMany({
    where: {
      menuItemId,
      status: 'PREPARING',
      ...(selectedOptions ? { selectedOptions: { equals: selectedOptions as Prisma.InputJsonValue } } : {}),
      ...(remark !== undefined ? { remark: remark.trim() || null } : {}),
      order: {
        vendorId: vendor.id,
        createdAt: { gte: new Date(windowStartISO), lt: new Date(windowEndISO) },
      },
    },
    data: { status: 'READY' },
  });
  return { updatedCount: result.count };
}

export async function bulkStatusUpdate(userId: string, orderIds: string[], status: OrderStatus) {
  const vendor = await getVendorForUser(userId);
  const result = await prisma.order.updateMany({
    where: { id: { in: orderIds }, vendorId: vendor.id },
    data: status === OrderStatus.READY
      ? { status, readyAt: new Date(), completedAt: new Date(), paymentStatus: PaymentStatus.PAID }
      : { status },
  });
  return { updatedCount: result.count };
}

export async function getVendorServingOrder(vendorId: string) {
  return prisma.order.findFirst({
    where: { vendorId, status: OrderStatus.PREPARING },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayNumber: true, eventOrderNumber: true, vendorId: true },
  });
}
