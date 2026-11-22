import { EventStatus, OrderStatus, PaymentMode, Prisma, ProductionBatchItemStatus, ProductionBatchStatus } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { getIO } from '../socket';
import { ORDERING_CLOSED_MESSAGE, ORDER_LIMIT_REACHED_MESSAGE } from './event.service';
import { currentMalaysiaDayRange, dailyCupUsageWhere, evaluateCupLimit, sumDrinkQuantities } from './cup-limit';
import { calculateLineTotal, money, sumMoney } from '../utils/money';

const DEVICE_ORDER_EXISTS_MESSAGE = 'This device has already placed an order for this event today.';

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
  customerName: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().trim().max(50, 'Name must be 50 characters or fewer.').nullable().optional(),
  ),
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
    if (group?.enabled === false && choiceIds.length > 0) {
      throw new Error(`${String(group?.title || 'Customization')} is currently unavailable.`);
    }
    if (group?.enabled === false) continue;
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

  return groups.filter((group) => group?.enabled !== false).flatMap((group) => {
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
  const vendor = await prisma.vendorProfile.findFirst({ where: { OR: [{ userId }, { staffUsers: { some: { id: userId } } }] } });
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
      if (settings?.deviceOrderLimitEnabled === true && deviceId) {
        const deviceDate = currentMalaysiaDayRange(orderCreatedAt).date;
        const existing = await tx.order.findFirst({
          where: { eventId: lockedEvent.id, deviceId, deviceOrderDate: deviceDate },
          select: { id: true },
        });
        if (existing) {
          const error = new Error(DEVICE_ORDER_EXISTS_MESSAGE);
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
      const usedQuantity = Number(cups._sum?.quantity || 0);
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
          customerName: parsed.customerName,
          customerPhone: parsed.customerPhone?.trim() || null,
          customerEmail: parsed.customerEmail?.trim() || null,
          deviceId: deviceId || null,
          deviceOrderDate: settings?.deviceOrderLimitEnabled === true
            ? currentMalaysiaDayRange(orderCreatedAt).date
            : null,
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }).catch((error: unknown) => {
      if (settings?.deviceOrderLimitEnabled === true
        && error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002') {
        const target = error.meta?.target;
        const fields = ['eventId', 'deviceId', 'deviceOrderDate'];
        if (Array.isArray(target) && target.length === fields.length
          && fields.every((field) => target.includes(field))) {
          throw Object.assign(new Error(DEVICE_ORDER_EXISTS_MESSAGE), { code: 'DEVICE_ORDER_EXISTS' });
        }
      }
      throw error;
    });

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

export function productionRecipeSignature(menuItemId: string, selectedOptions: unknown, remark: unknown) {
  const groups = Array.isArray(selectedOptions) ? selectedOptions.map((group: any) => ({
    groupId: String(group?.groupId || ''),
    title: String(group?.title || ''),
    choices: (Array.isArray(group?.choices) ? group.choices : []).map((choice: any) => ({
      id: String(choice?.id || ''), label: String(choice?.label || ''),
    })).sort((a: any, b: any) => (a.id || a.label).localeCompare(b.id || b.label)),
  })).filter((group: any) => group.groupId || group.title || group.choices.length)
    .sort((a: any, b: any) => (a.groupId || a.title).localeCompare(b.groupId || b.title)) : [];
  return JSON.stringify({ menuItemId, groups, remark: String(remark || '').trim() });
}

export function allocateProductionBatchItems<T extends { id: string; quantity: number }>(items: T[], capacity: number) {
  const allocated: T[] = [];
  let total = 0;
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (allocated.length === 0 && quantity > capacity) return allocated;
    if (total + quantity > capacity) break;
    allocated.push(item);
    total += quantity;
  }
  return allocated;
}

function itemChronology(a: any, b: any) {
  return new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime()
    || Number(a.order.eventOrderNumber) - Number(b.order.eventOrderNumber)
    || a.id.localeCompare(b.id);
}

function waitingItemView(item: any) {
  return {
    id: item.id,
    orderId: item.orderId,
    orderNumber: item.order.eventOrderNumber,
    quantity: item.quantity,
    createdAt: item.order.createdAt,
  };
}

export async function getProductionQueue(userId: string) {
  const vendor = await getVendorForUser(userId);
  const [event, settings] = await Promise.all([
    prisma.event.findFirst({ where: { vendorId: vendor.id, status: EventStatus.ACTIVE }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
    prisma.vendorSettings.findUnique({ where: { vendorId: vendor.id }, select: { defaultBatchSize: true } }),
  ]);
  const defaultBatchSize = Math.max(1, Math.min(10000, Number(settings?.defaultBatchSize || 10)));
  if (!event) return { eventId: null, defaultBatchSize, batches: [], waitingGroups: [] };
  const [items, batches] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        status: 'PREPARING', productionBatchItem: null,
        order: { vendorId: vendor.id, eventId: event.id, status: OrderStatus.PREPARING },
      },
      include: { order: { select: { id: true, eventOrderNumber: true, createdAt: true } }, menuItem: { select: { id: true, name: true } } },
      orderBy: [{ order: { createdAt: 'asc' } }, { id: 'asc' }],
    }),
    prisma.productionBatch.findMany({
      where: { vendorId: vendor.id, eventId: event.id, status: ProductionBatchStatus.PREPARING },
      include: {
        items: {
          where: { status: ProductionBatchItemStatus.PREPARING },
          include: { orderItem: { include: { order: { select: { id: true, eventOrderNumber: true, createdAt: true } } } } },
        },
      },
      orderBy: { batchNumber: 'asc' },
    }),
  ]);
  const grouped = new Map<string, any>();
  for (const item of items) {
    const signature = productionRecipeSignature(item.menuItemId, item.selectedOptions, item.remark);
    const group = grouped.get(signature) || {
      signature, menuItemId: item.menuItemId, drinkName: item.menuItem.name,
      selectedOptions: item.selectedOptions, remark: item.remark || '', totalQuantity: 0, items: [], oldestAt: item.order.createdAt,
    };
    group.totalQuantity += item.quantity;
    group.items.push(waitingItemView(item));
    grouped.set(signature, group);
  }
  const activeBatches = batches.filter((batch) => batch.items.length > 0).map((batch) => {
    const included = new Map<number, { orderNumber: number; quantity: number }>();
    for (const member of batch.items) {
      const orderNumber = member.orderItem.order.eventOrderNumber;
      const current = included.get(orderNumber) || { orderNumber, quantity: 0 };
      current.quantity += member.quantity;
      included.set(orderNumber, current);
    }
    return {
      id: batch.id, batchNumber: batch.batchNumber, status: batch.status, capacity: batch.capacity,
      recipeSignature: batch.recipeSignature, menuItemId: batch.menuItemId, drinkName: batch.drinkName,
      selectedOptions: batch.selectedOptions, remark: batch.remark || '', createdAt: batch.createdAt,
      totalCups: batch.items.reduce((sum, item) => sum + item.quantity, 0),
      orders: Array.from(included.values()).sort((a, b) => a.orderNumber - b.orderNumber),
    };
  });
  return { eventId: event.id, defaultBatchSize, batches: activeBatches, waitingGroups: Array.from(grouped.values()) };
}

const startBatchSchema = z.object({
  signature: z.string().min(1),
  capacity: z.number().int().min(1).max(10000),
  orderItemIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function startProductionBatch(userId: string, raw: unknown) {
  const input = startBatchSchema.parse(raw);
  if (new Set(input.orderItemIds).size !== input.orderItemIds.length) throw new Error('Duplicate order items are not allowed');
  const vendor = await getVendorForUser(userId);
  const batch = await prisma.$transaction(async (tx) => {
    const lockedEvents = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Event" WHERE "vendorId" = ${vendor.id} AND "status" = 'ACTIVE'
      ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
    `);
    const event = lockedEvents[0];
    if (!event) throw new Error('There is no active event.');
    const baseWhere: Prisma.OrderItemWhereInput = {
      status: 'PREPARING', productionBatchItem: null,
      order: { vendorId: vendor.id, eventId: event.id, status: OrderStatus.PREPARING },
    };
    const candidates = await tx.orderItem.findMany({
      where: baseWhere,
      include: { order: { select: { id: true, eventOrderNumber: true, createdAt: true } }, menuItem: { select: { id: true, name: true } } },
    });
    const matchingIds = candidates.filter((item) => productionRecipeSignature(item.menuItemId, item.selectedOptions, item.remark) === input.signature).map((item) => item.order.id);
    await lockOrders(tx, vendor.id, [...new Set(matchingIds)].sort());
    const current = (await tx.orderItem.findMany({
      where: baseWhere,
      include: { order: { select: { id: true, eventOrderNumber: true, createdAt: true } }, menuItem: { select: { id: true, name: true } } },
    })).filter((item) => productionRecipeSignature(item.menuItemId, item.selectedOptions, item.remark) === input.signature)
      .sort(itemChronology);
    const allocation = allocateProductionBatchItems(current, input.capacity);
    if (allocation.length === 0) {
      const first = current[0];
      if (first && first.quantity > input.capacity) throw new Error(`The oldest order item has ${first.quantity} cups. Increase capacity to at least ${first.quantity}.`);
      throw Object.assign(new Error('The waiting queue changed. Review the updated allocation and try again.'), { code: 'BATCH_QUEUE_CHANGED' });
    }
    const allocatedIds = new Set(allocation.map((item) => item.id));
    if (allocation.length !== input.orderItemIds.length || input.orderItemIds.some((id) => !allocatedIds.has(id))) {
      throw Object.assign(new Error('The waiting queue changed. Review the updated allocation and try again.'), { code: 'BATCH_QUEUE_CHANGED' });
    }
    const first = allocation[0];
    const batchNumber = (await tx.productionBatch.count({ where: { eventId: event.id } })) + 1;
    return tx.productionBatch.create({
      data: {
        vendorId: vendor.id, eventId: event.id, batchNumber, capacity: input.capacity,
        recipeSignature: input.signature, menuItemId: first.menuItemId, drinkName: first.menuItem.name,
        selectedOptions: (first.selectedOptions || Prisma.JsonNull) as Prisma.InputJsonValue,
        remark: first.remark,
        items: { create: allocation.map((item) => ({ orderItemId: item.id, quantity: item.quantity })) },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  getIO().to(`vendor:${vendor.id}`).emit('production_batch_changed', { vendorId: vendor.id, eventId: batch.eventId, batchId: batch.id, status: batch.status });
  return { batch, queue: await getProductionQueue(userId) };
}

export async function markProductionBatchReady(userId: string, batchId: string) {
  const vendor = await getVendorForUser(userId);
  const result = await prisma.$transaction(async (tx) => {
    const owned = await tx.productionBatch.findFirst({ where: { id: batchId, vendorId: vendor.id }, select: { eventId: true } });
    if (!owned) throw new Error('Batch not found');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${owned.eventId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ProductionBatch" WHERE "id" = ${batchId} AND "vendorId" = ${vendor.id} FOR UPDATE`);
    const batch = await tx.productionBatch.findFirst({ where: { id: batchId, vendorId: vendor.id }, include: { event: { select: { status: true } } } });
    if (!batch) throw new Error('Batch not found');
    if (batch.status === ProductionBatchStatus.READY) return { batch, orderIds: [] as string[] };
    if (batch.status === ProductionBatchStatus.CANCELLED || batch.event.status !== EventStatus.ACTIVE) throw new Error('This batch is no longer active');
    const members = await tx.productionBatchItem.findMany({ where: { batchId, status: ProductionBatchItemStatus.PREPARING }, include: { orderItem: { select: { id: true, orderId: true, status: true, order: { select: { status: true } } } } } });
    if (!members.length) throw new Error('There are no active order items in this batch');
    const orderIds = [...new Set(members.map((member) => member.orderItem.orderId))].sort();
    await lockOrders(tx, vendor.id, orderIds);
    const currentMembers = await tx.productionBatchItem.findMany({ where: { batchId, status: ProductionBatchItemStatus.PREPARING }, include: { orderItem: { select: { id: true, orderId: true, status: true, order: { select: { status: true } } } } } });
    const active = currentMembers.filter((member) => member.orderItem.status === 'PREPARING' && member.orderItem.order.status === 'PREPARING');
    if (!active.length) throw new Error('The batch items changed. Refresh the queue.');
    const ids = active.map((member) => member.orderItem.id);
    await tx.orderItem.updateMany({ where: { id: { in: ids }, status: 'PREPARING' }, data: { status: 'READY' } });
    await tx.productionBatchItem.updateMany({ where: { id: { in: active.map((member) => member.id) }, status: ProductionBatchItemStatus.PREPARING }, data: { status: ProductionBatchItemStatus.READY, readyAt: new Date() } });
    const updatedBatch = await tx.productionBatch.update({ where: { id: batchId }, data: { status: ProductionBatchStatus.READY, completedAt: new Date() } });
    for (const orderId of orderIds) await reconcileReadyOrder(tx, orderId);
    return { batch: updatedBatch, orderIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  const orders = await Promise.all(result.orderIds.map(notifyOrder));
  getIO().to(`vendor:${vendor.id}`).emit('production_batch_changed', { vendorId: vendor.id, eventId: result.batch.eventId, batchId, status: result.batch.status });
  return { batch: result.batch, orders: orders.filter(Boolean), queue: await getProductionQueue(userId) };
}

// Dashboard projection: include the call-out name, avoid menu configuration, images, other customer/device data,
// and prices that neither Kitchen nor Ready History renders.
const liveOrderSelect = {
  id: true, vendorId: true, eventOrderNumber: true, displayNumber: true,
  status: true, paymentStatus: true, cancelledAt: true, createdAt: true, readyAt: true, customerName: true,
  items: { select: {
    id: true, quantity: true, status: true, remark: true, selectedOptions: true,
    menuItem: { select: { id: true, name: true } },
  } },
  event: { select: { id: true, eventName: true, eventDate: true, location: true, status: true } },
} satisfies Prisma.OrderSelect;

export async function getVendorLiveOrders(userId: string) {
  const vendor = await getVendorForUser(userId);
  await normalizeLiveOrders(vendor.id);
  return prisma.order.findMany({
    where: {
      vendorId: vendor.id,
      event: { status: EventStatus.ACTIVE },
      status: { in: [OrderStatus.PREPARING, OrderStatus.READY] },
    },
    select: liveOrderSelect,
    orderBy: { createdAt: 'desc' },
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
    where: { id: orderId, vendorId: vendor.id, event: { vendorId: vendor.id } },
    include: { items: true, event: { select: { status: true, vendorId: true } } },
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

export async function cancelOrder(orderId: string, userId: string) {
  const { vendor, order } = await assertOrderOwner(orderId, userId);
  if (order.event?.status !== EventStatus.ACTIVE) throw new Error('Historical orders cannot be cancelled');
  const result = await prisma.$transaction(async (tx) => {
    // Serialize against order creation's event lock (cup/device accounting), then
    // lock the parent row shared with READY transitions. Exactly one wins.
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${order.eventId} FOR UPDATE`);
    await lockOrders(tx, vendor.id, [orderId]);
    const current = await loadPreparationOrder(tx, orderId);
    if (!current) throw new Error('Order not found');
    if (current.event.vendorId !== vendor.id) throw new Error('Order not found');
    if (current.event.status !== EventStatus.ACTIVE) throw new Error('Historical orders cannot be cancelled');
    if (current.status !== OrderStatus.PREPARING) {
      throw new Error(current.status === OrderStatus.READY ? 'READY orders cannot be cancelled' : 'Order is already cancelled');
    }
    const changed = await tx.order.updateMany({
      where: { id: orderId, vendorId: vendor.id, eventId: order.eventId, status: OrderStatus.PREPARING },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: userId,
        // Release the existing unique eligibility slot; keep deviceId and record.
        deviceOrderDate: null,
      },
    });
    if (!changed.count) throw new Error('Order is no longer cancellable');
    const allocated = await tx.productionBatchItem.findMany({
      where: { status: ProductionBatchItemStatus.PREPARING, orderItem: { orderId } },
      select: { id: true, batchId: true },
    });
    await tx.productionBatchItem.updateMany({
      where: { id: { in: allocated.map((item) => item.id) } },
      data: { status: ProductionBatchItemStatus.CANCELLED, cancelledAt: new Date() },
    });
    for (const batchId of [...new Set(allocated.map((item) => item.batchId))]) {
      const stillPreparing = await tx.productionBatchItem.count({ where: { batchId, status: ProductionBatchItemStatus.PREPARING } });
      if (stillPreparing === 0) await tx.productionBatch.updateMany({
        where: { id: batchId, status: ProductionBatchStatus.PREPARING },
        data: { status: ProductionBatchStatus.CANCELLED, completedAt: new Date() },
      });
    }
    return { batchIds: [...new Set(allocated.map((item) => item.batchId))] };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  for (const batchId of result.batchIds) getIO().to(`vendor:${vendor.id}`).emit('production_batch_changed', {
    vendorId: vendor.id, eventId: order.eventId, batchId, status: 'UPDATED',
  });
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
    include: { items: true, event: { select: { status: true, vendorId: true } } },
  });
}

async function reconcileReadyOrder(tx: Prisma.TransactionClient, orderId: string) {
  const order = await loadPreparationOrder(tx, orderId);
  if (!order || order.status !== OrderStatus.PREPARING || !order.items.length
    || order.event.status !== EventStatus.ACTIVE
    || order.items.some((item) => item.status !== 'READY')) return false;
  const activeBatchItem = await tx.productionBatchItem.findFirst({
    where: { status: ProductionBatchItemStatus.PREPARING, batch: { status: ProductionBatchStatus.PREPARING }, orderItem: { orderId } },
    select: { id: true },
  });
  if (activeBatchItem) return false;
  await tx.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.READY,
      readyAt: new Date(),
    },
  });
  return true;
}

async function assertNoActiveBatchItems(tx: Prisma.TransactionClient, orderItemIds: string[]) {
  if (!orderItemIds.length) return;
  const allocated = await tx.productionBatchItem.findFirst({
    where: { orderItemId: { in: orderItemIds }, status: ProductionBatchItemStatus.PREPARING, batch: { status: ProductionBatchStatus.PREPARING } },
    include: { batch: { select: { batchNumber: true } } },
  });
  if (allocated) throw new Error(`This order item belongs to active Batch #${allocated.batch.batchNumber}. Mark it ready from Batch Queue.`);
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
    await assertNoActiveBatchItems(tx, [itemId]);
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
    await assertNoActiveBatchItems(tx, locked.items.filter((item) => item.status === 'PREPARING').map((item) => item.id));
    await tx.orderItem.updateMany({ where: { orderId, status: 'PREPARING' }, data: { status: 'READY' } });
    await reconcileReadyOrder(tx, orderId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  return notifyOrder(orderId);
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
      await assertNoActiveBatchItems(tx, order.items.filter((item) => item.status === 'PREPARING').map((item) => item.id));
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
