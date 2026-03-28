import * as menuService from '../services/menu.service';

import { ZodError } from 'zod';

function errorToMessage(err: any) {
  if (!err) return 'Unknown error';
  if (err instanceof ZodError) return 'Invalid menu item payload';
  return err.message || String(err);
}

export const createMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const item = await menuService.createMenuItem(userId, req.body);

    res.json({
      success: true,
      data: { ...item, price: Number(item.price) },
    });
  } catch (error: any) {
    console.error('[menu-items] create failed', error);
    res.status(400).json({
      success: false,
      message: errorToMessage(error),
      details: error instanceof ZodError ? error.issues : undefined,
    });
  }
};

export const getVendorMenu = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const items = await menuService.getVendorMenu(userId);

    const normalized = items.map((item: any) => ({
      ...item,
      price: Number(item.price),
      optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups : [],
      remarksEnabled: item.remarksEnabled !== false,
    }));

    res.json({ success: true, data: normalized });
  } catch (error: any) {
    console.error('[menu-items] list failed', error);
    res.status(400).json({ success: false, message: errorToMessage(error) });
  }
};

export const updateMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const itemId = req.params.id;

    const updated = await menuService.updateMenuItem(userId, itemId, req.body);

    res.json({
      success: true,
      data: { ...updated, price: Number(updated.price) },
    });
  } catch (error: any) {
    console.error('[menu-items] update failed', error);
    res.status(400).json({
      success: false,
      message: errorToMessage(error),
      details: error instanceof ZodError ? error.issues : undefined,
    });
  }
};

export const deleteMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const itemId = req.params.id;

    const deletedOrArchived = await menuService.deleteMenuItem(userId, itemId);

    res.json({
      success: true,
      data: { archived: deletedOrArchived?.isAvailable === false },
    });
  } catch (error: any) {
    console.error('[menu-items] delete failed', error);
    res.status(400).json({ success: false, message: errorToMessage(error) });
  }
};
