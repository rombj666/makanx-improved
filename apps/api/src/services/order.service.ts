import { OrderStatus, PaymentMode, PaymentStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { getIO } from '../socket';
import { getMalaysiaDayRange, getMalaysiaTodayString } from '../utils/date';

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
  return selected.map((selection) => {
    const group = groups.find((candidate) => String(candidate?.id) === selection.groupId);
    const choices = Array.isArray(group?.choices)
      ? group.choices.filter((choice: any) => selection.choiceIds.includes(String(choice?.id)))
      : [];
    return {
      groupId: selection.groupId,
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

async function getUsedQuantity(vendorId: string, date = getMalaysiaTodayString()) {
  const { start, end } = getMalaysiaDayRange(date);
  const result = await prisma.orderItem.aggregate({
    where: { order: { vendorId, createdAt: { gte: start, lte: end } } },
    _sum: { quantity: true },
  });
  return Number(result._sum.quantity || 0);
}

export async function createOrder(_customerId: string | undefined, input: unknown) {
  const parsed = createOrderSchema.parse(input);
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: parsed.vendorId },
    include: { settings: true },
  });
  if (!vendor) throw new Error('Store not found');
  const settings = vendor.settings;
  if (settings && !settings.orderingOpen) throw new Error('Ordering is currently closed.');

  const requestedQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
  if (settings?.deviceOrderLimitEnabled) {
    if (!parsed.deviceId) throw new Error('Device ID is required.');
    if (requestedQuantity > settings.maxDrinksPerOrder) {
      throw new Error(`Maximum ${settings.maxDrinksPerOrder} item(s) per order.`);
    }
    const { start, end } = getMalaysiaDayRange(getMalaysiaTodayString());
    const existing = await prisma.order.findFirst({
      where: { vendorId: vendor.id, deviceId: parsed.deviceId, createdAt: { gte: start, lte: end } },
      select: { id: true },
    });
    if (existing) {
      const error = new Error('This device has already placed an order today.');
      (error as any).code = 'DEVICE_ORDER_EXISTS';
      (error as any).existingOrderId = existing.id;
      throw error;
    }
  }

  if (settings?.dailyLimitEnabled) {
    const used = await getUsedQuantity(vendor.id);
    const usage = await prisma.vendorDailyUsage.findUnique({
      where: { vendorId_date: { vendorId: vendor.id, date: getMalaysiaTodayString() } },
    });
    if (usage?.orderingClosed || used + requestedQuantity > settings.dailyLimitQuantity) {
      const error = new Error('This store has reached its daily order limit.');
      (error as any).code = 'PRODUCTION_LIMIT_EXCEEDED';
      (error as any).remainingCups = Math.max(0, settings.dailyLimitQuantity - used);
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
    const latest = await tx.order.aggregate({ where: { vendorId: vendor.id }, _max: { displayNumber: true } });
    return tx.order.create({
      data: {
        customerId: parsed.guestId,
        customerName: parsed.customerName?.trim() || null,
        customerPhone: parsed.customerPhone?.trim() || null,
        customerEmail: parsed.customerEmail?.trim() || null,
        deviceId: parsed.deviceId || null,
        vendorId: vendor.id,
        displayNumber: Number(latest._max.displayNumber || 0) + 1,
        paymentMode: parsed.paymentMode,
        totalAmount,
        items: { create: preparedItems },
      },
      include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
    });
  });

  getIO().to(`vendor:${vendor.id}`).emit('order_created', order);
  return { order, estimatedMinutes: Math.max(...menuItems.map((item) => item.basePrepMin), 5) };
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
    include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
  });
}

export async function getCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
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
    select: { id: true, displayNumber: true, vendorId: true },
  });
}
