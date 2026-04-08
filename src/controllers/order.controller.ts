import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { ZodError } from 'zod';
import { OrderStatus } from '@makanx/shared';
import prisma from '../utils/prisma';

export const createOrder = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.createOrder(req.user.userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getVendorOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.getVendorOrders(req.user.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getVendorLiveOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.getVendorLiveOrders(req.user.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getVendorProductionBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const groupByWindow = req.query.groupByWindow === 'true';

    const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId: req.user.userId } });
    if (!vendorProfile) throw new Error('Vendor profile not found');

    const result = await orderService.getVendorProductionBatch(vendorProfile.id, groupByWindow);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await orderService.getOrderById(id);
    if (!result) return res.status(404).json({ success: false, error: 'Order not found' });
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const markBatchItemsReady = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const { menuItemId, windowStart, windowEnd, selectedOptions, remark } = req.body;
    const result = await orderService.markBatchItemsReady(
      req.user.userId,
      menuItemId,
      windowStart,
      windowEnd,
      selectedOptions,
      remark
    );
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const markOrderItemsReady = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.markOrderItemsReady(req.user.userId, req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const cancelOrder = async (req: Request, res: Response) => {
  try {
    const customerId = req.user?.userId || (req.body.guestId as string);
    if (!customerId) throw new Error('Unauthorized');
    const result = await orderService.cancelOrder(req.params.id, customerId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const bulkStatusUpdate = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const { orderIds, status } = req.body;
    const result = await orderService.bulkStatusUpdate(req.user.userId, orderIds, status);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getCustomerOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.getCustomerOrders(req.user.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const { status } = req.body;
    
    // Basic validation for status enum
    if (!Object.values(OrderStatus).includes(status)) {
        throw new Error('Invalid status');
    }

    const result = await orderService.updateOrderStatus(req.params.id, req.user.userId, status);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
