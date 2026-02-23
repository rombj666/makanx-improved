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
        create: orderItemsData,
      },
    },
    include: {
      items: {
        include: { menuItem: true }
      },
      customer: {
        select: { name: true, email: true }
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
      items: { include: { menuItem: true } },
      customer: { select: { name: true } }
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

  // Determine timestamps to update
  const data: any = { status };
  const now = new Date();

  if (status === 'PREPARING' && !order.acceptedAt) data.acceptedAt = now;
  if (status === 'READY' && !order.readyAt) data.readyAt = now;
  if (status === 'COMPLETED' && !order.completedAt) data.completedAt = now;

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data,
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
  
  // Also emit to vendor room so other devices update? 
  // Or assume the caller updates local state. 
  // Better to emit to ensure sync.
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  return updatedOrder;
};

export const bulkStatusUpdate = async (userId: string, orderIds: string[], status: OrderStatus) => {
  // Find vendor profile
  const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendorProfile) throw new Error('Vendor profile not found');

  // Prepare timestamp updates
  const data: any = { status };
  const now = new Date();

  if (status === 'PREPARING') {
      // Only set acceptedAt if it is currently null. 
      // Prisma updateMany doesn't support conditional set based on current value easily in one go 
      // UNLESS we just accept overwriting or do raw query.
      // However, the requirement says "Apply timestamp updates only when the respective timestamp is null".
      // We can't do conditional update inside updateMany easily for fields.
      // BUT we can run updateMany ONLY on records where timestamp IS null.
      // But we also need to update status for ALL records in orderIds.
      
      // Strategy:
      // 1. Update status for all matching orders.
      // 2. Update timestamp for matching orders where timestamp is null.
      // This requires 2 queries but is safe.
      // Or we can just do one update if we don't mind overwriting (but req says don't overwrite).
      
      // Let's do:
      // 1. Update status for all.
      // 2. Update timestamp for those with status=NEW_STATUS and timestamp=NULL.
  }

  // Actually, a cleaner way for bulk might be to just iterate if N is small, but for "bulk" we want efficiency.
  // Let's use updateMany.
  
  // Step 1: Update Status for all valid orders owned by vendor
  const updateResult = await prisma.order.updateMany({
      where: {
          id: { in: orderIds },
          vendorId: vendorProfile.id
      },
      data: { status }
  });

  // Step 2: Conditionally update timestamps
  // We only update the timestamp if it's null.
  // We can do this by adding `timestamp: null` to the where clause.
  
  let timestampUpdateResult = { count: 0 };

  if (status === 'PREPARING') {
      timestampUpdateResult = await prisma.order.updateMany({
          where: {
              id: { in: orderIds },
              vendorId: vendorProfile.id,
              acceptedAt: null
          },
          data: { acceptedAt: now }
      });
  } else if (status === 'READY') {
      timestampUpdateResult = await prisma.order.updateMany({
          where: {
              id: { in: orderIds },
              vendorId: vendorProfile.id,
              readyAt: null
          },
          data: { readyAt: now }
      });
  } else if (status === 'COMPLETED') {
      timestampUpdateResult = await prisma.order.updateMany({
          where: {
              id: { in: orderIds },
              vendorId: vendorProfile.id,
              completedAt: null
          },
          data: { completedAt: now }
      });
  }

  // Audit Logs (Bulk) - Ideally we create one log entry per order or a bulk entry
  // For simplicity/performance, maybe skip or do a generic log?
  // Let's skip individual audit logs for bulk action to save DB ops for now, 
  // or just log the bulk action itself if AuditLog supported it.
  
  // Emit events? 
  // We should emit events to affected customers.
  // We can fetch the updated orders to know who to notify.
  // If orderIds list is huge, this is heavy. Assuming reasonable batch size.
  const updatedOrders = await prisma.order.findMany({
      where: { id: { in: orderIds }, vendorId: vendorProfile.id },
      select: { id: true, customerId: true, status: true, vendorId: true }
  });

  updatedOrders.forEach(order => {
      getIO().to(`user:${order.customerId}`).emit('order_updated', order);
  });
  
  // Notify vendor dashboard
  getIO().to(`vendor:${vendorProfile.id}`).emit('orders_bulk_updated', { orderIds, status });

  return { updatedCount: updateResult.count };
};
