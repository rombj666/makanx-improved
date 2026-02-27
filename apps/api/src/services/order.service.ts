import prisma from '../utils/prisma';
import { z } from 'zod';
import { getIO } from '../socket';
import { OrderStatus, PaymentMode, PaymentStatus, AuditAction, Prisma } from '@prisma/client';
import { createAuditLog } from './audit.service';

/**
 * Create Order
 * - Validates menu items belong to vendor
 * - Calculates total
 * - Finds vendor's booth (first assigned booth)
 * - Uses BoothOrderCounter to assign boothOrderNumber starting from 1 and never resetting
 * - Returns { order, estimatedMinutes }
 */
const createOrderSchema = z.object({
  vendorId: z.string().uuid(),
  items: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().min(1),
    })
  ),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.PAY_AT_BOOTH),
  guestId: z.string().optional(),
});

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

  const orderItemsData: {
    menuItemId: string;
    quantity: number;
    price: Prisma.Decimal;
  }[] = [];

  for (const item of items) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);
    if (menuItem.vendorId !== vendorId) throw new Error('Menu item does not belong to vendor');

    const priceNumber = Number(menuItem.price);
    totalAmountNumber += priceNumber * item.quantity;

    orderItemsData.push({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price, // snapshot
    });
  }

  const totalAmount = new Prisma.Decimal(totalAmountNumber);

  const paymentStatus =
    paymentMode === PaymentMode.MOCK_PAID ? PaymentStatus.PAID : PaymentStatus.PENDING;

  // Find booth for this vendor (first assigned booth)
  const booth = await prisma.booth.findFirst({
    where: { vendorId },
    select: { id: true },
  });

  if (!booth) throw new Error('Vendor has no assigned booth');

  // Transaction: increment counter + create order + compute ETA
  const result = await prisma.$transaction(async (tx) => {
    // Ensure counter exists
    const counter = await tx.boothOrderCounter.upsert({
      where: { boothId: booth.id },
      create: { boothId: booth.id, currentNumber: 0 },
      update: {}, // no-op
    });

    // Increment and get new number
    const updated = await tx.boothOrderCounter.update({
      where: { boothId: booth.id },
      data: { currentNumber: { increment: 1 } },
    });

    const createdOrder = await tx.order.create({
      data: {
        customerId: finalCustomerId,
        vendorId,
        boothId: booth.id,
        boothOrderNumber: updated.currentNumber, // starts at 1
        totalAmount,
        status: OrderStatus.PENDING,
        paymentMode,
        paymentStatus,
        items: { create: orderItemsData },
      },
      include: {
        items: { include: { menuItem: true } },
        customer: { select: { name: true, email: true } },
      },
    });

    // ETA: count pending+preparing for booth (includes this order)
    const pendingCount = await tx.order.count({
      where: {
        boothId: booth.id,
        status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING] },
      },
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
    { status: OrderStatus.PENDING, paymentStatus, paymentMode }
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
      customer: { select: { name: true } },
      booth: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Customer Orders (for customer "My Orders")
 */
export const getCustomerOrders = async (customerId: string) => {
  return prisma.order.findMany({
    where: { customerId },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } },
      booth: { select: { id: true, name: true } },
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
    include: { vendor: true },
  });
  if (!order) throw new Error('Order not found');

  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile || vendorProfile.id !== order.vendorId) throw new Error('Unauthorized');

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
      booth: { select: { id: true, name: true } },
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