import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { ZodError } from 'zod';
import { OrderStatus } from '@prisma/client';

const isValidOrderStatus = (value: any): value is OrderStatus => {
  return Object.values(OrderStatus).includes(value);
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await orderService.createOrder(req.user.userId, req.body);
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

    const result = await orderService.getVendorOrders(req.user.userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

export const getCustomerOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // customerId is userId in your design (guest user created on QR login)
    const result = await orderService.getCustomerOrders(req.user.userId);
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