import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { ZodError } from 'zod';
import { OrderStatus } from '@prisma/client';
import prisma from '../utils/prisma';

const isValidOrderStatus = (value: any): value is OrderStatus => {
  return Object.values(OrderStatus).includes(value);
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    // Check for user or guest identity
    if (!req.user && !req.body.guestId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = await orderService.createOrder(req.user?.userId, req.body);
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getVendorOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    console.log('[order] getVendorOrders: user', req.user.userId);
    const result = await orderService.getVendorOrders(req.user.userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[order] getVendorOrders error', { userId: req.user?.userId, error: error.message });
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getVendorLiveOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    console.log('[order] getVendorLiveOrders: user', req.user.userId);
    const result = await orderService.getVendorLiveOrders(req.user.userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[order] getVendorLiveOrders error', { userId: req.user?.userId, error: error.message });
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getVendorProductionBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const groupByWindow = req.query.groupByWindow === "true";
    
    console.log("Production batch requested by vendor:", req.user?.userId);
    console.log("Group by window:", groupByWindow);

    // Get vendor profile first to get vendorId
    const vendorProfile = await prisma.vendorProfile.findUnique({ 
      where: { userId: req.user.userId } 
    });
    
    if (!vendorProfile) {
      return res.status(404).json({ success: false, error: 'Vendor profile not found' });
    }

    const result = await orderService.getVendorProductionBatch(
      vendorProfile.id,
      groupByWindow
    );
    console.log("Returning production batch count:", result.length);

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getCustomerOrders = async (req: Request, res: Response) => {
  try {
    // customerId is userId (JWT) or guestId (query param)
    const customerId = req.user?.userId || (req.query.guestId as string);
    
    if (!customerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = await orderService.getCustomerOrders(customerId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await orderService.getOrderById(id);
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { status } = req.body;

    if (!isValidOrderStatus(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const result = await orderService.updateOrderStatus(req.params.id, req.user.userId, status);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    // Only customer who owns the order (or guestId) can cancel
    const customerId = req.user?.userId || (req.body.guestId as string);
    if (!customerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await orderService.cancelOrder(req.params.id, customerId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[order] cancel failed', { orderId: req.params.id, message: error.message });
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const bulkStatusUpdate = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { orderIds, status } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.some((x) => typeof x !== 'string')) {
      return res.status(400).json({ success: false, error: 'Invalid orderIds' });
    }

    if (!isValidOrderStatus(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const result = await orderService.bulkStatusUpdate(req.user.userId, orderIds, status);
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const markBatchItemsReady = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { menuItemId, windowStart, windowEnd, selectedOptions, remark } = req.body;
    if (!menuItemId || !windowStart || !windowEnd) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }
    const result = await orderService.markBatchItemsReady(
      req.user.userId,
      String(menuItemId),
      String(windowStart),
      String(windowEnd),
      Array.isArray(selectedOptions) ? selectedOptions : undefined,
      typeof remark === 'string' ? remark : undefined
    );
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const markOrderItemsReady = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await orderService.markOrderItemsReady(req.user.userId, req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};
