import prisma from '../utils/prisma';
import { z } from 'zod';
import { getIO } from '../socket';
import { OrderStatus, PaymentMode, PaymentStatus, AuditAction, Prisma } from '@prisma/client';
import { createAuditLog } from './audit.service';
import { sendReadyNotification } from './push.service';
import { sendOrderReadyMessage } from './whatsapp.service';

/**
 * Create Order
 * - Validates menu items belong to vendor
 * - Calculates total
 * - Validates vendor has an assigned booth (first assigned booth)
 * - Assigns order without booth-specific numbering (schema has no booth counters)
 * - Returns { order, estimatedMinutes }
 */
const createOrderSchema = z.object({
  vendorId: z.string().uuid(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().min(1).max(99),
      remark: z.string().max(500).optional(),
      selectedOptions: z
        .array(
          z.object({
            groupId: z.string().min(1),
            choiceIds: z.array(z.string().min(1)).min(1),
          })
        )
        .optional(),
    })
  ),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.PAY_AT_BOOTH),
  guestId: z.string().optional(),
});

function coerceOptionGroups(val: any): any[] {
  return Array.isArray(val) ? val : [];
}

export const createOrder = async (
  customerId: string | undefined,
  input: z.infer<typeof createOrderSchema>
) => {
  const { vendorId, items, paymentMode, guestId } = createOrderSchema.parse(input);

  // Use guestId as customerId if provided and no customerId from JWT
  const finalCustomerId = customerId || guestId;
  if (!finalCustomerId) throw new Error('Customer identity missing');

  // Build order items + total
  let totalAmountNumber = 0;

  const orderItemsData: any[] = [];

  for (const item of items) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);
    if (menuItem.vendorId !== vendorId) throw new Error('Menu item does not belong to vendor');

    const optionGroups = coerceOptionGroups((menuItem as any).optionGroups);
    const remarksEnabled = (menuItem as any).remarksEnabled !== false;
    const selections = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];

    const selectionsByGroup = new Map<string, string[]>();
    for (const s of selections) {
      if (!s?.groupId) continue;
      const ids = Array.isArray(s.choiceIds) ? s.choiceIds.filter(Boolean) : [];
      if (ids.length === 0) continue;
      selectionsByGroup.set(String(s.groupId), Array.from(new Set(ids.map(String))));
    }

    const frozenSelections: any[] = [];
    for (const g of optionGroups) {
      const groupId = String(g?.id || '');
      if (!groupId) continue;
      const required = !!g?.required;
      const type = String(g?.type || 'single');
      const title = String(g?.title || '');
      const choices = Array.isArray(g?.choices) ? g.choices : [];

      const selected = selectionsByGroup.get(groupId) || [];
      if (required && selected.length === 0) {
        throw new Error(`Missing required option: ${title || groupId}`);
      }
      if (selected.length === 0) continue;

      if (type === 'single' && selected.length !== 1) {
        throw new Error(`Invalid selection for ${title || groupId}`);
      }

      const choiceMap = new Map<string, any>();
      for (const c of choices) {
        const cid = String(c?.id || '');
        if (!cid) continue;
        choiceMap.set(cid, c);
      }

      const invalid = selected.find((cid) => !choiceMap.has(cid));
      if (invalid) throw new Error(`Invalid choice for ${title || groupId}`);

      const selectedChoices = selected.map((cid) => {
        const c = choiceMap.get(cid);
        return {
          id: String(c?.id || cid),
          label: String(c?.label || ''),
          priceDelta: typeof c?.priceDelta === 'number' ? c.priceDelta : 0,
        };
      });

      frozenSelections.push({
        groupId,
        title,
        type,
        required,
        choices: selectedChoices,
      });
    }

    const priceNumber = Number(menuItem.price);
    totalAmountNumber += priceNumber * item.quantity;

    orderItemsData.push({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price, // snapshot
      remark: remarksEnabled && item.remark ? String(item.remark).trim() : null,
      selectedOptions: frozenSelections,
    });
  }

  const totalAmount = new Prisma.Decimal(totalAmountNumber);

  const paymentStatus =
    paymentMode === PaymentMode.MOCK_PAID ? PaymentStatus.PAID : PaymentStatus.PENDING;

  // Ensure the vendor has at least one assigned booth
  const booth = await prisma.booth.findFirst({
    where: { vendorId },
    select: { id: true },
  });

  if (!booth) throw new Error('Vendor has no assigned booth');

  // Transaction: create order + compute ETA (vendor-based)
  const result = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        customerId: finalCustomerId,
        vendorId,
        totalAmount,
        status: OrderStatus.PREPARING,
        paymentMode,
        paymentStatus,
        items: { create: orderItemsData as any },
      },
      include: {
        items: { include: { menuItem: true } },
      },
    });

    const pendingCount = await tx.order.count({
      where: { vendorId, status: { in: [OrderStatus.PREPARING] } },
    });

    const avgMinutesPerOrder = 5;
    const estimatedMinutes = pendingCount * avgMinutesPerOrder;

    return { order: createdOrder, estimatedMinutes };
  });

  // Audit log
  await createAuditLog(
    AuditAction.ORDER_STATUS_CHANGE,
    result.order.id,
    'Order',
    finalCustomerId,
    { status: OrderStatus.PREPARING, paymentStatus, paymentMode }
  );

  // Realtime: vendor sees new order
  getIO().to(`vendor:${vendorId}`).emit('order_created', result.order);

  // Realtime: customer (guest or logged in)
  getIO().to(`user:${finalCustomerId}`).emit('order_created_customer', result.order);

  return result;
};

/**
 * Vendor Orders (for vendor dashboard)
 */
export const getVendorOrders = async (userId: string) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  return prisma.order.findMany({
    where: { vendorId: vendorProfile.id },
    include: {
      items: { include: { menuItem: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getVendorProductionBatch = async (
  vendorId: string,
  groupByWindow: boolean
) => {
  const orders = await prisma.order.findMany({
    where: {
      vendorId,
      status: "PREPARING",
    },
    include: {
      items: {
        include: {
          menuItem: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!groupByWindow) {
    // Return raw orders immediately
    return orders;
  }

  // Group into 5-minute windows
  const grouped: Record<string, any[]> = {};

  orders.forEach((order) => {
    const created = new Date(order.createdAt);
    const minutes = Math.floor(created.getMinutes() / 5) * 5;
    const windowStart = new Date(created);
    windowStart.setMinutes(minutes, 0, 0);

    const key = windowStart.toISOString();

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(order);
  });

  return Object.entries(grouped).map(([window, orders]) => ({
    window,
    orders,
  }));
};

/**
 * Customer Orders (for customer "My Orders")
 */
export const getCustomerOrders = async (customerId: string) => {
  return prisma.order.findMany({
    where: { 
      customerId,
      status: { in: ['PREPARING', 'READY', 'COMPLETED'] }
    },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Update status (vendor only)
 */
export const updateOrderStatus = async (orderId: string, userId: string, status: OrderStatus) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { vendor: true, items: true },
  });
  if (!order) throw new Error('Order not found');

  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile || vendorProfile.id !== order.vendorId) throw new Error('Unauthorized');

  if (status === OrderStatus.COMPLETED) {
    const allReady = Array.isArray(order.items) && order.items.every((it: any) => it.status === 'READY');
    if (!allReady) {
      throw new Error('Order cannot be completed because some items are not ready.');
    }
  }

  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status };

  // Only set timestamps if they are null
  if (status === OrderStatus.PREPARING && !order.acceptedAt) (data as any).acceptedAt = now;
  if (status === OrderStatus.READY && !order.readyAt) (data as any).readyAt = now;
  if (status === OrderStatus.COMPLETED && !order.completedAt) (data as any).completedAt = now;

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data,
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } },
    },
  });

  await createAuditLog(
    AuditAction.ORDER_STATUS_CHANGE,
    order.id,
    'Order',
    userId,
    { oldStatus: order.status, newStatus: status }
  );

  // Notify customer + vendor realtime
  getIO().to(`user:${order.customerId}`).emit('order_updated', updatedOrder);
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  if (order.status !== OrderStatus.READY && status === OrderStatus.READY) {
    console.log('[push] READY transition', { orderId: order.id, customerId: order.customerId });
    try {
      await sendReadyNotification(updatedOrder);
    } catch (err: any) {
      console.error('[push] READY send failed', { orderId: order.id, message: err?.message || err });
    }
    try {
      await sendOrderReadyMessage(updatedOrder);
    } catch (err: any) {
      console.error('[whatsapp] READY send failed', { orderId: order.id, message: err?.message || err });
    }
  }

  return updatedOrder;
};

/**
 * Mark all items for a menuItem as READY within a vendor time window
 */
export const markBatchItemsReady = async (
  userId: string,
  menuItemId: string,
  windowStartISO: string,
  windowEndISO: string
) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  const windowStart = new Date(windowStartISO);
  const windowEnd = new Date(windowEndISO);

  // Update order items matching the criteria
  const result = await (prisma as any).orderItem.updateMany({
    where: {
      menuItemId,
      status: 'PREPARING',
      order: {
        vendorId: vendorProfile.id,
        status: 'PREPARING',
        createdAt: { gte: windowStart, lt: windowEnd },
      },
    },
    data: { status: 'READY' },
  });

  // Optionally fetch affected orders and notify
  const affectedOrders = await prisma.order.findMany({
    where: {
      vendorId: vendorProfile.id,
      status: 'PREPARING',
      createdAt: { gte: windowStart, lt: windowEnd },
      items: { some: { menuItemId } },
    },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } },
    },
  });

  const io = getIO();

  for (const o of affectedOrders) {
    const allReady = o.items.every((it: any) => it.status === 'READY');
    const nextStatus: OrderStatus = allReady ? OrderStatus.READY : OrderStatus.PREPARING;
    if (o.status !== nextStatus) {
      const updatedOrder = await prisma.order.update({
        where: { id: o.id },
        data: { status: nextStatus, ...(nextStatus === OrderStatus.READY ? { readyAt: new Date() } : {}) },
        include: {
          items: { include: { menuItem: true } },
          vendor: { select: { businessName: true } },
        },
      });
      io.to(`user:${updatedOrder.customerId}`).emit('order_updated', updatedOrder);
      io.to(`vendor:${updatedOrder.vendorId}`).emit('order_updated', updatedOrder);
      if (nextStatus === OrderStatus.READY) {
        try {
          await sendReadyNotification(updatedOrder);
        } catch (err: any) {
          console.error('[push] READY send failed', { orderId: updatedOrder.id, message: err?.message || err });
        }
        try {
          await sendOrderReadyMessage(updatedOrder);
        } catch (err: any) {
          console.error('[whatsapp] READY send failed', { orderId: updatedOrder.id, message: err?.message || err });
        }
      }
    } else {
      io.to(`vendor:${o.vendorId}`).emit('order_updated', o);
    }
  }

  // Notify vendor channel so dashboards can refresh if listening
  io.to(`vendor:${vendorProfile.id}`).emit('orders_items_ready', {
    menuItemId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    affectedOrderIds: affectedOrders.map((o) => o.id),
    updatedCount: result.count ?? 0,
  });

  return { updatedCount: result.count ?? 0 };
};

/**
 * Mark all items for an order as READY (ungrouped kitchen)
 */
export const markOrderItemsReady = async (userId: string, orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
  });
  if (!order) throw new Error('Order not found');

  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile || vendorProfile.id !== order.vendorId) throw new Error('Unauthorized');

  await (prisma as any).orderItem.updateMany({
    where: { orderId, status: 'PREPARING' },
    data: { status: 'READY' },
  });

  const refreshed = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
  });
  if (!refreshed) throw new Error('Order not found');

  const allReady = refreshed.items.every((it: any) => it.status === 'READY');
  const nextStatus: OrderStatus = allReady ? OrderStatus.READY : OrderStatus.PREPARING;

  const updatedOrder =
    refreshed.status === nextStatus
      ? refreshed
      : await prisma.order.update({
          where: { id: orderId },
          data: { status: nextStatus, ...(nextStatus === OrderStatus.READY ? { readyAt: new Date() } : {}) },
          include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
        });

  const io = getIO();
  io.to(`user:${updatedOrder.customerId}`).emit('order_updated', updatedOrder);
  io.to(`vendor:${updatedOrder.vendorId}`).emit('order_updated', updatedOrder);
  if (nextStatus === OrderStatus.READY) {
    try {
      await sendReadyNotification(updatedOrder);
    } catch (err: any) {
      console.error('[push] READY send failed', { orderId: updatedOrder.id, message: err?.message || err });
    }
    if (refreshed.status !== nextStatus) {
      try {
        await sendOrderReadyMessage(updatedOrder);
      } catch (err: any) {
        console.error('[whatsapp] READY send failed', { orderId: updatedOrder.id, message: err?.message || err });
      }
    }
  }

  return updatedOrder;
};
/**
 * Bulk status update (vendor only)
 */
export const bulkStatusUpdate = async (userId: string, orderIds: string[], status: OrderStatus) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  const now = new Date();

  // 1) Update status for all
  const updateResult = await prisma.order.updateMany({
    where: { id: { in: orderIds }, vendorId: vendorProfile.id },
    data: { status },
  });

  // 2) Conditionally set timestamps only where null
  if (status === OrderStatus.PREPARING) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds }, vendorId: vendorProfile.id, acceptedAt: null },
      data: { acceptedAt: now },
    });
  }
  if (status === OrderStatus.READY) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds }, vendorId: vendorProfile.id, readyAt: null },
      data: { readyAt: now },
    });
  }
  if (status === OrderStatus.COMPLETED) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds }, vendorId: vendorProfile.id, completedAt: null },
      data: { completedAt: now },
    });
  }

  // Notify customers (light payload)
  const affected = await prisma.order.findMany({
    where: { id: { in: orderIds }, vendorId: vendorProfile.id },
    select: { id: true, customerId: true, status: true, vendorId: true },
  });

  affected.forEach((o) => {
    getIO().to(`user:${o.customerId}`).emit('order_updated', o);
  });

  getIO().to(`vendor:${vendorProfile.id}`).emit('orders_bulk_updated', { orderIds, status });

  return { updatedCount: updateResult.count };
};
