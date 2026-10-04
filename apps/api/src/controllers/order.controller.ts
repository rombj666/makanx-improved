import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { ZodError } from 'zod';
import { OrderStatus } from '@prisma/client';
import prisma from '../utils/prisma';

const isReadyStatus = (value: any): value is OrderStatus => {
  return value === OrderStatus.READY;
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    // Check for user or guest identity
    if (!req.guest) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = await orderService.createOrder(req.guest!.guestId, { ...req.body, guestId: req.guest!.guestId }, req.deviceId);
    return res.status(201).json({ success: true, data: { ...result, order: orderService.customerOrderView(result.order) } });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: error.issues.map((e) => e.message).join(', ') 
      });
    }
    
    if (error.code === 'DEVICE_ORDER_EXISTS') {
      return res.status(409).json({
        success: false,
        message: error.message,
        existingOrderId: error.existingOrderId,
      });
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
    
    console.log("[order] getVendorProductionBatch request", { userId: req.user.userId, groupByWindow });

    // Get vendor profile first to get vendorId
    const vendorProfile = await prisma.vendorProfile.findUnique({ 
      where: { userId: req.user.userId } 
    });
    
    if (!vendorProfile) {
      console.warn("[order] getVendorProductionBatch: vendor profile not found", { userId: req.user.userId });
      return res.status(404).json({ success: false, error: 'Vendor profile not found' });
    }

    console.log("[order] getVendorProductionBatch profile found", { vendorProfileId: vendorProfile.id });

    const result = await orderService.getVendorProductionBatch(
      vendorProfile.id,
      groupByWindow
    );
    console.log("[order] getVendorProductionBatch: success", { vendorProfileId: vendorProfile.id, count: result.length });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error("[order] getVendorProductionBatch error", { userId: req.user?.userId, error: error.message });
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getCustomerOrders = async (req: Request, res: Response) => {
  try {
    const customerId = req.guest?.guestId;
    
    if (!customerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = (await orderService.getCustomerOrders(customerId)).map(orderService.customerOrderView);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Unable to retrieve orders' });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  if (!req.user && !req.guest) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const owner = await prisma.order.findUnique({
      where: { id: req.params.id }, select: { vendorId: true, customerId: true },
    });
    // Same response body for missing and forbidden orders; no owner information.
    if (!owner) return res.status(404).json({ success: false, error: 'Order unavailable' });
    const vendor = req.user ? await prisma.vendorProfile.findUnique({
      where: { userId: req.user.userId }, select: { id: true },
    }) : null;
    const allowed = req.user ? vendor?.id === owner.vendorId : req.guest?.guestId === owner.customerId;
    if (!allowed) return res.status(403).json({ success: false, error: 'Order unavailable' });
    const result = await orderService.getOrderById(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Order unavailable' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: req.user ? result : orderService.customerOrderView(result) });
  } catch {
    return res.status(500).json({ success: false, error: 'Unable to retrieve order' });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { status } = req.body;

    if (!isReadyStatus(status)) {
      return res.status(400).json({ success: false, error: 'Only PREPARING to READY is allowed' });
    }

    const result = await orderService.updateOrderStatus(req.params.id, req.user.userId, status);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
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

    if (!isReadyStatus(status)) {
      return res.status(400).json({ success: false, error: 'Only PREPARING to READY is allowed' });
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

export const getVendorServingOrder = async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    const serving = await orderService.getVendorServingOrder(vendorId);
    return res.status(200).json({ success: true, data: serving });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const markOrderItemReady = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { orderId, itemId } = req.params;
    const result = await orderService.markOrderItemReady(req.user.userId, orderId, itemId);
    return res.status(200).json({ success: true, data: result });
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
