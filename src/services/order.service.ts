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
  
  // Also emit to vendor room so other devices update? 
  // Or assume the caller updates local state. 
  // Better to emit to ensure sync.
  getIO().to(`vendor:${order.vendorId}`).emit('order_updated', updatedOrder);

  return updatedOrder;
};
