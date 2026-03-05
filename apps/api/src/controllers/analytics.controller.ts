import { Request, Response } from 'express';
import prisma from '../utils/prisma';

const parseDateRange = (dateStr?: string) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const organizerDailySummary = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const orders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
        vendor: {
          booths: { some: { eventId } },
        },
      },
      select: { id: true, vendorId: true, totalAmount: true },
    });

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalVendors = new Set(orders.map((o) => o.vendorId)).size;
    const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({ success: true, data: { totalRevenue, totalOrders, totalVendors, avgOrder } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const organizerVendorRevenue = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const orders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
        vendor: { booths: { some: { eventId } } },
      },
      select: { vendorId: true, totalAmount: true },
    });

    const byVendor: Record<string, { orderCount: number; revenue: number }> = {};
    for (const o of orders) {
      const vid = o.vendorId;
      if (!byVendor[vid]) byVendor[vid] = { orderCount: 0, revenue: 0 };
      byVendor[vid].orderCount += 1;
      byVendor[vid].revenue += Number(o.totalAmount);
    }

    const vendorIds = Object.keys(byVendor);
    const vendors = await prisma.vendorProfile.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, businessName: true },
    });
    const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.businessName]));

    const data = vendorIds.map((id) => ({
      vendorId: id,
      vendorName: nameMap[id] || 'Unknown Vendor',
      orderCount: byVendor[id].orderCount,
      revenue: byVendor[id].revenue,
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const organizerProductPerformance = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          status: 'COMPLETED',
          createdAt: { gte: start, lte: end },
          vendor: { booths: { some: { eventId } } },
        },
      },
      select: {
        menuItemId: true,
        quantity: true,
        price: true,
        menuItem: { select: { name: true } },
      },
    });

    const byProduct: Record<
      string,
      { productName: string; totalQty: number; totalRevenue: number }
    > = {};

    for (const it of items) {
      const id = it.menuItemId;
      if (!byProduct[id]) {
        byProduct[id] = { productName: it.menuItem?.name || 'Unknown', totalQty: 0, totalRevenue: 0 };
      }
      byProduct[id].totalQty += it.quantity;
      byProduct[id].totalRevenue += Number(it.price) * it.quantity;
    }

    const data = Object.values(byProduct);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const organizerRevenueTrend = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const orders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
        vendor: { booths: { some: { eventId } } },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) buckets[h] = 0;
    for (const o of orders) {
      const hour = new Date(o.createdAt).getHours();
      buckets[hour] += Number(o.totalAmount);
    }
    const data = Object.keys(buckets).map((h) => ({ hour: Number(h), revenue: buckets[Number(h)] }));
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorSalesSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const orders = await prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
      },
      select: { totalAmount: true },
    });

    const ordersCount = orders.length;
    const revenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const avgOrder = ordersCount > 0 ? revenue / ordersCount : 0;
    res.json({ success: true, data: { revenue, orders: ordersCount, avgOrder } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorProductPerformance = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          vendorId: vendor.id,
          status: 'COMPLETED',
          createdAt: { gte: start, lte: end },
        },
      },
      select: { menuItemId: true, quantity: true, price: true, menuItem: { select: { name: true } } },
    });

    const byProduct: Record<string, { productName: string; qtySold: number; revenue: number }> = {};
    for (const it of items) {
      const id = it.menuItemId;
      if (!byProduct[id]) {
        byProduct[id] = { productName: it.menuItem?.name || 'Unknown', qtySold: 0, revenue: 0 };
      }
      byProduct[id].qtySold += it.quantity;
      byProduct[id].revenue += Number(it.price) * it.quantity;
    }
    const data = Object.values(byProduct);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorRevenueTrend = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const orders = await prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) buckets[h] = 0;
    for (const o of orders) {
      const hour = new Date(o.createdAt).getHours();
      buckets[hour] += Number(o.totalAmount);
    }
    const data = Object.keys(buckets).map((h) => ({ hour: Number(h), revenue: buckets[Number(h)] }));
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorCompletedOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = parseDateRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const orders = await prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
      },
      include: {
        items: { include: { menuItem: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = orders.map((o) => ({
      orderNumber: (o as any).orderNumber || o.id.slice(-4),
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      items: o.items.map((it) => ({
        productName: it.menuItem?.name || 'Unknown',
        qty: it.quantity,
        price: Number(it.price),
      })),
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
