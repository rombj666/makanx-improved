import { Request, Response } from 'express';
import * as menuService from '../services/menu.service';
import * as orderService from '../services/order.service';

function errorToMessage(err: any) {
  return err?.message || String(err || 'Unknown error');
}

export const getVendor = async (req: Request, res: Response) => {
  try {
    const vendor = await menuService.getPublicMenuBySlug(String(req.params.slug || ''));
    const { menuItems: _menuItems, ...profile } = vendor;
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(404).json({ success: false, message: errorToMessage(error) });
  }
};

export const getVendorMenu = async (req: Request, res: Response) => {
  try {
    const vendor = await menuService.getPublicMenuBySlug(String(req.params.slug || ''));
    res.json({ success: true, data: vendor });
  } catch (error: any) {
    res.status(404).json({ success: false, message: errorToMessage(error) });
  }
};

export const createVendorOrder = async (req: Request, res: Response) => {
  try {
    const result = await orderService.createOrderForVendorSlug(String(req.params.slug || ''), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error.code === 'DEVICE_ORDER_EXISTS') {
      return res.status(409).json({
        success: false,
        message: error.message,
        existingOrderId: error.existingOrderId,
      });
    }

    res.status(400).json({ success: false, error: errorToMessage(error) });
  }
};
