import { EventStatus, OrderStatus, PaymentMode, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { getIO } from '../socket';
import { ORDERING_CLOSED_MESSAGE, ORDER_LIMIT_REACHED_MESSAGE } from './event.service';
import { currentMalaysiaDayRange, dailyCupUsageWhere, evaluateCupLimit, sumDrinkQuantities } from './cup-limit';
import { calculateLineTotal, money, sumMoney } from '../utils/money';

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

export async function createOrder(_customerId: string | undefined, input: unknown, deviceId?: string) {
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

  const requestedQuantity = sumDrinkQuantities(parsed.items);
  if (settings?.deviceOrderLimitEnabled) {
    if (!deviceId) throw new Error('Device ID is required.');
    if (requestedQuantity > settings.maxDrinksPerOrder) {
      throw new Error(`Maximum ${settings.maxDrinksPerOrder} item(s) per order.`);
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
    const extras = sumMoney(snapshot.flatMap((group) => group.choices).map((choice) => choice.priceDelta));
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: money(menuItem.price).add(extras),
      remark: item.remark?.trim() || null,
      selectedOptions: snapshot,
      status: 'PREPARING' as const,
    };
  });
  const totalAmount = calculateLineTotal(preparedItems);

  const order = await prisma.$transaction(async (tx) => {
      const lockedEvents = await tx.$queryRaw<Array<{
        id: string;
        nextOrderNumber: number;
        orderingStatus: string;
      }>>(Prisma.sql`
        SELECT "id", "nextOrderNumber", "orderingStatus"
        FROM "Event"
        WHERE "vendorId" = ${vendor.id}
          AND "status" = 'ACTIVE'
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `);
      const lockedEvent = lockedEvents[0];
      if (!lockedEvent) throw new Error(ORDERING_CLOSED_MESSAGE);
      if (lockedEvent.orderingStatus === 'MANUALLY_CLOSED') throw new Error(ORDERING_CLOSED_MESSAGE);
      const orderCreatedAt = new Date();

      // Per-device daily order check now runs inside the same event-row lock
      // that serializes cup-limit accounting. The database unique constraint
      // (eventId, deviceId, deviceOrderDate) is the final backstop that makes
      // a second order from the same device on the same day impossible even
      // under concurrent racing requests.
      if (settings?.deviceOrderLimitEnabled && deviceId) {
        const deviceDate = currentMalaysiaDayRange(orderCreatedAt).date;
        const existing = await tx.order.findFirst({
          where: { eventId: lockedEvent.id, deviceId, deviceOrderDate: deviceDate },
          select: { id: true },
        });
        if (existing) {
          const error = new Error('This device has already placed an order today.');
          (error as any).code = 'DEVICE_ORDER_EXISTS';
          (error as any).existingOrderId = existing.id;
          throw error;
        }
      }

      // Keep the event lock until the order and its items are committed. Every
      // concurrent customer order for this event must pass through this lock,
      // so the aggregate below always includes the previously accepted order.
      const lockedSettings = await tx.$queryRaw<Array<{
        dailyLimitEnabled: boolean;
        dailyLimitQuantity: number;
      }>>(Prisma.sql`
        SELECT "dailyLimitEnabled", "dailyLimitQuantity"
        FROM "VendorSettings"
        WHERE "vendorId" = ${vendor.id}
        FOR SHARE
      `);

      const cups = await tx.orderItem.aggregate({
        where: dailyCupUsageWhere(lockedEvent.id, orderCreatedAt),
        _sum: { quantity: true },
      });
      const usedQuantity = Number(cups._sum.quantity || 0);
      const cupSettings = lockedSettings[0];
      const cupLimit = evaluateCupLimit({
        enabled: cupSettings?.dailyLimitEnabled === true,
        target: Number(cupSettings?.dailyLimitQuantity || 0),
        usedQuantity,
        requestedQuantity,
      });

      if (cupLimit.alreadyReached || cupLimit.wouldExceed) {
        const error = new Error(ORDER_LIMIT_REACHED_MESSAGE);
        (error as any).code = cupLimit.alreadyReached ? 'ORDER_LIMIT_REACHED' : 'ORDER_LIMIT_EXCEEDED';
        throw error;
      }

      const eventOrderNumber = Number(lockedEvent.nextOrderNumber);
      await tx.event.update({
        where: { id: lockedEvent.id },
        data: {
          nextOrderNumber: { increment: 1 },
          orderingStatus: cupLimit.reachesTarget ? 'LIMIT_REACHED' : 'OPEN',
        },
      });

      return tx.order.create({
        data: {
          customerId: parsed.guestId,
          customerName: parsed.customerName?.trim() || null,
          customerPhone: parsed.customerPhone?.trim() || null,
          customerEmail: parsed.customerEmail?.trim() || null,
          deviceId: deviceId || null,
          deviceOrderDate: currentMalaysiaDayRange(orderCreatedAt).date,
          vendorId: vendor.id,
          eventId: lockedEvent.id,
          eventOrderNumber,
          displayNumber: eventOrderNumber,
          paymentMode: parsed.paymentMode,
          status: OrderStatus.PREPARING,
          totalAmount,
          createdAt: orderCreatedAt,
          items: { create: preparedItems },
        },
        include: {
          items: { include: { menuItem: true } },
          event: { select: { id: true, eventName: true, eventDate: true, location: true, status: true } },
          vendor: { select: { businessName: true, slug: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  getIO().to(`vendor:${vendor.id}`).emit('order_created', order);
  return { order, estimatedMinutes: Math.max(...menuItems.map((item) => item.basePrepMin), 5) };
}

export async function createOrderForVendorSlug(slug: string, input: unknown, deviceId?: string) {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!vendor) throw new Error('Store not found');
  return createOrder(undefined, { ...(input as any), vendorId: vendor.id }, deviceId);
}

export async function getVendorOrders(userId: string) {
  const vendor = await getVendorForUser(userId);
  return prisma.order.findMany({
    where: { vendorId: vendor.id },
    include: {
      items: { include: { menuItem: true } },
      event: { select: { id: true, eventName: true, eventDate: true, location: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getVendorLiveOrders(userId: string) {
  const vendor = await getVendorForUser(userId);
  await normalizeLiveOrders(vendor.id);
  return getVendorOrders(userId);
}

export async function getVendorProductionBatch(vendorId: string, _groupByWindow: boolean) {
  await normalizeLiveOrders(vendorId);
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
      event: { select: { id: true, eventName: true, eventDate: true, location: true, status: true } },
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
    include: { items: true, event: { select: { status: true } } },
  });
  if (!order) throw new Error('Order not found');
  return { vendor, order };
}

function assertReadyTarget(status: unknown): asserts status is OrderStatus {
  if (status !== OrderStatus.READY) throw new Error('Only PREPARING to READY is allowed');
}

function assertActivePreparationOrder(order: any) {
  if (order.event?.status !== EventStatus.ACTIVE) throw new Error('Historical orders cannot be changed');
  if (order.status !== OrderStatus.PREPARING && order.status !== OrderStatus.READY) {
    throw new Error('Order is outside the preparation workflow');
  }
}

async function notifyOrder(orderId: string) {
  const order = await getOrderById(orderId);
  if (order) {
    getIO().to(`user:${order.customerId}`).emit('order_updated', customerOrderView(order));
    getIO().to(`vendor:${order.vendorId}`).emit('order_updated', order);
  }
  return order;
}

export async function updateOrderStatus(orderId: string, userId: string, status: OrderStatus) {
  assertReadyTarget(status);
  const { vendor } = await assertOrderOwner(orderId, userId);
  await prisma.$transaction(async (tx) => {
    await lockOrders(tx, vendor.id, [orderId]);
    const order = await loadPreparationOrder(tx, orderId);
    if (!order) throw new Error('Order not found');
    assertActivePreparationOrder(order);
    if (order.status === OrderStatus.READY) return;
    if (!order.items.length || order.items.some((item) => item.status !== 'READY')) {
      throw new Error('All order items must be READY before the order can be READY');
    }
    await reconcileReadyOrder(tx, orderId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return notifyOrder(orderId);
}

// Lock parents before touching items so simultaneous final-item actions serialize.
async function lockOrders(tx: Prisma.TransactionClient, vendorId: string, orderIds: string[]) {
  if (!orderIds.length) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Order"
    WHERE "vendorId" = ${vendorId} AND "id" IN (${Prisma.join(orderIds)})
    ORDER BY "id" FOR UPDATE
  `);
}

async function loadPreparationOrder(tx: Prisma.TransactionClient, orderId: string) {
  return tx.order.findUnique({
    where: { id: orderId },
    include: { items: true, event: { select: { status: true } } },
  });
}

async function reconcileReadyOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await loadPreparationOrder(tx, orderId);
  if (!order || order.status !== OrderStatus.PREPARING || !order.items.length
    || order.event.status !== EventStatus.ACTIVE
    || order.items.some((item) => item.status !== 'READY')) return false;
  await tx.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.READY,
      readyAt: new Date(),
    },
  });
  return true;
}

async function normalizeLiveOrders(vendorId: string) {
  await prisma.$transaction(async (tx) => {
    const candidates = await tx.order.findMany({
      where: {
        vendorId, status: OrderStatus.PREPARING,
        event: { status: EventStatus.ACTIVE },
        items: { some: {}, every: { status: 'READY' } },
      },
      select: { id: true },
    });
    await lockOrders(tx, vendorId, candidates.map((order) => order.id));
    for (const order of candidates) await reconcileReadyOrder(tx, order.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function markOrderItemReady(userId: string, orderId: string, itemId: string) {
  const { vendor, order } = await assertOrderOwner(orderId, userId);
  assertActivePreparationOrder(order);
  if (!order.items.some((item) => item.id === itemId)) throw new Error('Item not found');
  await prisma.$transaction(async (tx) => {
    await lockOrders(tx, vendor.id, [orderId]);
    const locked = await loadPreparationOrder(tx, orderId);
    if (!locked) throw new Error('Order not found');
    assertActivePreparationOrder(locked);
    const item = locked.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error('Item not found');
    if (item.status !== 'PREPARING' && item.status !== 'READY') {
      throw new Error('Order item is outside the preparation workflow');
    }
    if (locked.status === OrderStatus.READY) {
      if (locked.items.every((candidate) => candidate.status === 'READY')) return;
      throw new Error('READY order cannot be changed');
    }
    if (item.status === 'READY') {
      await reconcileReadyOrder(tx, orderId);
      return;
    }
    await tx.orderItem.updateMany({
      where: { id: itemId, orderId, status: 'PREPARING' },
      data: { status: 'READY' },
    });
    await reconcileReadyOrder(tx, orderId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return notifyOrder(orderId);
}

export async function markOrderItemsReady(userId: string, orderId: string) {
  const { vendor, order } = await assertOrderOwner(orderId, userId);
  assertActivePreparationOrder(order);
  await prisma.$transaction(async (tx) => {
    await lockOrders(tx, vendor.id, [orderId]);
    const locked = await loadPreparationOrder(tx, orderId);
    if (!locked) throw new Error('Order not found');
    assertActivePreparationOrder(locked);
    if (locked.status === OrderStatus.READY) {
      if (locked.items.length && locked.items.every((item) => item.status === 'READY')) return;
      throw new Error('READY order cannot be changed');
    }
    if (!locked.items.length || locked.items.some((item) => item.status !== 'PREPARING' && item.status !== 'READY')) {
      throw new Error('Order items are outside the preparation workflow');
    }
    await tx.orderItem.updateMany({ where: { orderId, status: 'PREPARING' }, data: { status: 'READY' } });
    await reconcileReadyOrder(tx, orderId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return notifyOrder(orderId);
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
  const result = await prisma.$transaction(async (tx) => {
    const where: Prisma.OrderItemWhereInput = {
      menuItemId,
      status: 'PREPARING',
      ...(selectedOptions ? { selectedOptions: { equals: selectedOptions as Prisma.InputJsonValue } } : {}),
      ...(remark !== undefined ? { remark: remark.trim() || null } : {}),
      order: {
        vendorId: vendor.id,
        status: OrderStatus.PREPARING,
        event: { status: EventStatus.ACTIVE },
        createdAt: { gte: new Date(windowStartISO), lt: new Date(windowEndISO) },
      },
    };
    const items = await tx.orderItem.findMany({ where, select: { id: true, orderId: true } });
    const orderIds = [...new Set(items.map((item) => item.orderId))];
    await lockOrders(tx, vendor.id, orderIds);
    const updated = await tx.orderItem.updateMany({
      where: { ...where, id: { in: items.map((item) => item.id) } },
      data: { status: 'READY' },
    });
    for (const orderId of orderIds) await reconcileReadyOrder(tx, orderId);
    return { updatedCount: updated.count, orderIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  const orders = await Promise.all(result.orderIds.map(notifyOrder));
  return { updatedCount: result.updatedCount, orders: orders.filter(Boolean) };
}

export async function bulkStatusUpdate(userId: string, orderIds: string[], status: OrderStatus) {
  assertReadyTarget(status);
  const vendor = await getVendorForUser(userId);
  const uniqueIds = [...new Set(orderIds)];
  const updatedCount = await prisma.$transaction(async (tx) => {
    await lockOrders(tx, vendor.id, uniqueIds);
    const orders = await tx.order.findMany({
      where: { id: { in: uniqueIds }, vendorId: vendor.id },
      include: { items: true, event: { select: { status: true } } },
    });
    if (orders.length !== uniqueIds.length) throw new Error('One or more orders were not found');
    for (const order of orders) {
      assertActivePreparationOrder(order);
      if (!order.items.length || order.items.some((item) => item.status !== 'PREPARING' && item.status !== 'READY')) {
        throw new Error('Order items are outside the preparation workflow');
      }
      if (order.status === OrderStatus.READY) {
        if (order.items.every((item) => item.status === 'READY')) continue;
        throw new Error('READY order cannot be changed');
      }
      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: 'PREPARING' },
        data: { status: 'READY' },
      });
      await reconcileReadyOrder(tx, order.id);
    }
    return orders.length;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return { updatedCount };
}

export async function getVendorServingOrder(vendorId: string) {
  return prisma.order.findFirst({
    where: { vendorId, status: OrderStatus.PREPARING },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayNumber: true, eventOrderNumber: true, vendorId: true },
  });
}

// Explicit customer response allowlist: keep routing/display data, omit owner IDs and PII.
export function customerOrderView(order: any) {
  return {
    id: order.id, eventOrderNumber: order.eventOrderNumber, displayNumber: order.displayNumber,
    status: order.status, paymentMode: order.paymentMode, paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount, createdAt: order.createdAt, readyAt: order.readyAt,
    vendor: order.vendor ? { businessName: order.vendor.businessName, slug: order.vendor.slug } : undefined,
    items: (order.items || []).map((item: any) => ({
      quantity: item.quantity, price: item.price, remark: item.remark, status: item.status,
      selectedOptions: Array.isArray(item.selectedOptions) ? item.selectedOptions.map((group: any) => ({
        title: group.title, choices: (group.choices || []).map((choice: any) => ({ label: choice.label, priceDelta: choice.priceDelta })),
      })) : [],
      menuItem: item.menuItem ? { name: item.menuItem.name, imageUrl: item.menuItem.imageUrl } : undefined,
    })),
  };
}
