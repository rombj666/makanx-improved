import * as menuService from '../services/menu.service';

export const createMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const item = await menuService.createMenuItem(userId, req.body);

    res.json({
      success: true,
      data: { ...item, price: Number(item.price) },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getVendorMenu = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const items = await menuService.getVendorMenu(userId);

    const normalized = items.map((item: any) => ({
      ...item,
      price: Number(item.price),
    }));

    res.json({ success: true, data: normalized });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
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
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const itemId = req.params.id;

    await menuService.deleteMenuItem(userId, itemId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};