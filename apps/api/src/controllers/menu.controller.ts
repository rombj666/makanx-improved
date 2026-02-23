import * as menuService from '../services/menu.service';

export const createMenuItem = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const item = await menuService.createMenuItem(userId, req.body);

    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getVendorMenu = async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const items = await menuService.getVendorMenu(userId);

    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};