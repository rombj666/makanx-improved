import { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { ZodError } from 'zod';
import { OrderStatus } from '@makanx/shared';

export const createOrder = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await orderService.createOrder(req.user.userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
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
