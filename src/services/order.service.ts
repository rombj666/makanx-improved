import prisma from '../utils/prisma';
import { z } from 'zod';
import { getIO } from '../socket';
import { OrderStatus, PaymentMode, PaymentStatus, AuditAction } from '@prisma/client';
import { createAuditLog } from './audit.service';

const createOrderSchema = z.object({
  vendorId: z.string().uuid(),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().min(1),
    remark: z.string().max(500).optional(),
  })),
  paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.PAY_AT_BOOTH),
});

export const createOrder = async (customerId: string, input: z.infer<typeof createOrderSchema>) => {
  const { vendorId, items, paymentMode } = createOrderSchema.parse(input);

  // Calculate total and verify items
  let totalAmount = 0;
  const orderItemsData = [];

  for (const item of items) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (!menuItem) throw new Error(`Menu item ${item.menuItemId} not found`);
    if (menuItem.vendorId !== vendorId) throw new Error(`Menu item does not belong to vendor`);
    
    // Prisma Decimal to JS Number for simple calculation (watch out for float precision in real apps)
    const price = Number(menuItem.price);
    totalAmount += price * item.quantity;
    
    orderItemsData.push({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price, // Store snapshot price
      remark: item.remark ? String(item.remark).trim() : null,
    });
  }

  const paymentStatus = paymentMode === PaymentMode.MOCK_PAID ? PaymentStatus.PAID : PaymentStatus.PENDING;

  const order = await prisma.order.create({
    data: {
      customerId,
      vendorId,
      totalAmount,
      status: 'PENDING',
      paymentMode,
      paymentStatus,
      items: {
        create: orderItemsData as any,
      },
    },
    include: {
      items: {
        include: { menuItem: true }
      }
    },
  });

  // Audit Log
  await createAuditLog(
    AuditAction.ORDER_STATUS_CHANGE,
    order.id,
    'Order',
    customerId,
    { status: 'PENDING', paymentStatus, paymentMode }
  );

  // Emit Realtime Event to Vendor
  getIO().to(`vendor:${vendorId}`).emit('order_created', order);

  return order;
};

export const getVendorOrders = async (userId: string) => {
  // Find vendor profile for user
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  return prisma.order.findMany({
    where: { vendorId: vendorProfile.id },
    include: {
      items: { include: { menuItem: true } }
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getCustomerOrders = async (customerId: string) => {
  return prisma.order.findMany({
    where: { customerId },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } }
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getVendorLiveOrders = async (userId: string) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  const recentCompletedSince = new Date(Date.now() - 2 * 60 * 60 * 1000);

  return prisma.order.findMany({
    where: {
      vendorId: vendorProfile.id,
      OR: [
        { status: { in: ['PREPARING', 'READY'] } },
        { status: 'COMPLETED', completedAt: { gte: recentCompletedSince } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { menuItem: true } }
    },
  });
};

export const getVendorProductionBatch = async (vendorId: string, groupByWindow: boolean) => {
  const orders = await prisma.order.findMany({
    where: {
      vendorId,
      status: 'PREPARING',
    },
    include: {
      items: { include: { menuItem: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!groupByWindow) return orders;

  const grouped: Record<string, any[]> = {};
  orders.forEach((order) => {
    const created = new Date(order.createdAt);
    const minutes = Math.floor(created.getMinutes() / 5) * 5;
    const windowStart = new Date(created);
    windowStart.setMinutes(minutes, 0, 0);
    const key = windowStart.toISOString();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  });

  return Object.entries(grouped).map(([window, orders]) => ({
    window,
    orders,
  }));
};

export const getOrderById = async (orderId: string) => {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } }
    },
  });
};

export const markBatchItemsReady = async (
  userId: string,
  menuItemId: string,
  windowStartISO: string,
  windowEndISO: string,
  selectedOptions?: any[],
  remark?: string
) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  const windowStart = new Date(windowStartISO);
  const windowEnd = new Date(windowEndISO);

  const result = await prisma.orderItem.updateMany({
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

  // After updating items, update orders status if all items are ready
  const affectedOrders = await prisma.order.findMany({
    where: {
      vendorId: vendorProfile.id,
      status: 'PREPARING',
      createdAt: { gte: windowStart, lt: windowEnd },
      items: { some: { menuItemId } },
    },
    include: { items: true },
  });

  for (const o of affectedOrders) {
    const allReady = o.items.every((it) => it.status === 'READY');
    if (allReady) {
      const updatedOrder = await prisma.order.update({
        where: { id: o.id },
        data: { status: 'READY', readyAt: new Date() },
        include: { items: { include: { menuItem: true } }, vendor: { select: { businessName: true } } },
      });
      getIO().to(`user:${o.customerId}`).emit('order_updated', updatedOrder);
      getIO().to(`vendor:${o.vendorId}`).emit('order_updated', updatedOrder);
    }
  }

  return { updatedCount: result.count };
};

export const markOrderItemsReady = async (userId: string, orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error('Order not found');

  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile || vendorProfile.id !== order.vendorId) throw new Error('Unauthorized');

  await prisma.orderItem.updateMany({
    where: { orderId, status: 'PREPARING' },
    data: { status: 'READY' },
  });

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'READY', readyAt: new Date() },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } }
    },
  });

  getIO().to(`user:${order.customerId}`).emit('order_updated', updatedOrder);
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  return updatedOrder;
};

export const cancelOrder = async (orderId: string, customerId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  if (order.customerId !== customerId) throw new Error('Unauthorized');
  if (order.status !== 'PENDING' && order.status !== 'PREPARING') {
    throw new Error('Order cannot be cancelled at this stage');
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } }
    },
  });

  getIO().to(`user:${order.customerId}`).emit('order_updated', updatedOrder);
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  return updatedOrder;
};

export const updateOrderStatus = async (orderId: string, userId: string, status: OrderStatus) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { vendor: true }
  });

  if (!order) throw new Error('Order not found');

  // Verify user owns the vendor profile
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile || vendorProfile.id !== order.vendorId) {
    throw new Error('Unauthorized');
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: {
      items: { include: { menuItem: true } },
      vendor: { select: { businessName: true } }
    }
  });

  // Audit Log
  await createAuditLog(
    AuditAction.ORDER_STATUS_CHANGE,
    order.id,
    'Order',
    userId, // Vendor ID (User ID)
    { oldStatus: order.status, newStatus: status }
  );

  // Emit Realtime Event to Customer
  getIO().to(`user:${order.customerId}`).emit('order_updated', updatedOrder);
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  return updatedOrder;
};

export const bulkStatusUpdate = async (userId: string, orderIds: string[], status: OrderStatus) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  await prisma.order.updateMany({
    where: { id: { in: orderIds }, vendorId: vendorProfile.id },
    data: { status },
  });

  const updatedOrders = await prisma.order.findMany({
    where: { id: { in: orderIds }, vendorId: vendorProfile.id },
    include: { items: { include: { menuItem: true } } },
  });

  updatedOrders.forEach((o) => {
    getIO().to(`user:${o.customerId}`).emit('order_updated', o);
    getIO().to(`vendor:${o.vendorId}`).emit('order_updated', o);
  });

  return { updatedCount: updatedOrders.length };
};

