import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { generateVendorSalesExcel } from '../services/excel.service';
import { getMalaysiaDayRange } from '../utils/date';
import { getVendorDailySalesReport } from '../services/report.service';

async function resolveCurrentVendorEventId(vendorId: string) {
  const now = new Date();
  const currentBooth = await prisma.booth.findFirst({
    where: {
      vendorId,
      event: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    },
    select: { eventId: true },
  });
  if (currentBooth?.eventId) return currentBooth.eventId;

  const activeBooth = await prisma.booth.findFirst({
    where: { vendorId, event: { status: 'ACTIVE' } },
    select: { eventId: true },
  });
  return activeBooth?.eventId ?? null;
}

export const organizerDailySummary = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = getMalaysiaDayRange(date);

    const orders = await prisma.order.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        status: { in: ['PREPARING', 'READY'] },
        createdAt: { gte: start, lte: end },
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
    const { start, end } = getMalaysiaDayRange(date);

    const orders = await prisma.order.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        status: { in: ['PREPARING', 'READY'] },
        createdAt: { gte: start, lte: end },
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
    const { start, end } = getMalaysiaDayRange(date);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          ...(eventId ? { eventId } : {}),
          status: { in: ['PREPARING', 'READY'] },
          createdAt: { gte: start, lte: end },
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

export const productPerformance = async (req: Request, res: Response) => {
  try {
    const role = (req as any).user?.role as Role | undefined;
    if (role === Role.VENDOR) {
      return vendorProductPerformance(req, res);
    }
    if (role === Role.ORGANIZER) {
      return organizerProductPerformance(req, res);
    }
    return res.status(403).json({ success: false, error: 'Forbidden' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const organizerRevenueTrend = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const { start, end } = getMalaysiaDayRange(date);

    const orders = await prisma.order.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        status: { in: ['PREPARING', 'READY'] },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) buckets[h] = 0;
    for (const o of orders) {
      // Correctly handle Malaysia timezone for bucket display
      const hour = new Date(new Date(o.createdAt).getTime() + (8 * 60 * 60 * 1000)).getUTCHours();
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
    const date = String(req.query.date || '');

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : undefined;
    const report = await getVendorDailySalesReport(vendor.id, date, eventId);
    
    res.json({ 
      success: true, 
      data: { 
        revenue: report.totalRevenue, 
        orders: report.totalOrders, 
        avgOrder: report.avgOrder 
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorProductPerformance = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const date = String(req.query.date || '');

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : undefined;
    const report = await getVendorDailySalesReport(vendor.id, date, eventId);
    
    res.json({ success: true, data: report.productPerformance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorRevenueTrend = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const date = String(req.query.date || '');
    const { start, end } = getMalaysiaDayRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });
    const eventId = typeof req.query.eventId === 'string' && req.query.eventId
      ? req.query.eventId
      : await resolveCurrentVendorEventId(vendor.id);

    const orders = await prisma.order.findMany({
      where: {
        vendorId: vendor.id,
        ...(eventId ? { eventId } : {}),
        status: { in: ['PREPARING', 'READY'] },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets: Record<number, number> = {};
    for (let h = 0; h < 24; h++) buckets[h] = 0;
    for (const o of orders) {
      // Correctly handle Malaysia timezone for bucket display
      const hour = new Date(new Date(o.createdAt).getTime() + (8 * 60 * 60 * 1000)).getUTCHours();
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
    const date = String(req.query.date || '');

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });

    const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : undefined;
    const report = await getVendorDailySalesReport(vendor.id, date, eventId);

    const data = report.orders.map((o) => ({
      orderNumber: typeof (o as any).displayNumber === 'number' && (o as any).displayNumber > 0
        ? `#${(o as any).displayNumber}`
        : `#${o.id.slice(-4)}`,
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      completedAt: o.completedAt,
      items: o.items.map((it: any) => ({
        productName: it.menuItem?.name || 'Unknown',
        qty: it.quantity,
        price: Number(it.price),
        remark: it.remark,
        selectedOptions: it.selectedOptions,
      })),
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};


export const organizerProductTrend = async (req: Request, res: Response) => {
  try {
    const eventId = String(req.query.eventId || '');
    const date = String(req.query.date || '');
    const windowMinutes = Number(req.query.window || 5) || 5;
    const topN = Number(req.query.top || 5) || 5;
    const { start, end } = getMalaysiaDayRange(date);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          ...(eventId ? { eventId } : {}),
          status: { in: ['PREPARING', 'READY'] },
          completedAt: { gte: start, lte: end },
        },
      },
      select: {
        quantity: true,
        order: { select: { completedAt: true } },
        menuItemId: true,
        menuItem: { select: { name: true } },
      },
      orderBy: { menuItemId: 'asc' },
    });

    const seriesMap: Record<string, { name: string; total: number; buckets: Record<string, number> }> =
      {};

    const bucketOf = (d: Date | null): string => {
      const base = d ? new Date(d) : new Date();
      const ms = windowMinutes * 60 * 1000;
      const floored = Math.floor(base.getTime() / ms) * ms;
      return new Date(floored).toISOString();
    };

    for (const it of items) {
      const id = it.menuItemId;
      const name = it.menuItem?.name || 'Unknown';
      const when = it.order?.completedAt || null;
      const bucket = bucketOf(when);

      if (!seriesMap[id]) seriesMap[id] = { name, total: 0, buckets: {} };
      seriesMap[id].total += it.quantity;
      seriesMap[id].buckets[bucket] = (seriesMap[id].buckets[bucket] || 0) + it.quantity;
    }

    const ranked = Object.entries(seriesMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, topN);

    const response = ranked.map(([id, s]) => ({
      productId: id,
      productName: s.name,
      points: Object.entries(s.buckets)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([t, qty]) => ({ time: t, qty })),
    }));

    res.json({ success: true, data: response });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorExportReport = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const date = String(req.query.date || '');

    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true }
    });

    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : undefined;
    const report = await getVendorDailySalesReport(vendor.id, date, eventId);

    const buffer = await generateVendorSalesExcel(vendor.businessName, date, report.orders);
    
    const fileName = `vendor-sales-report-${vendor.businessName.toLowerCase().replace(/\s+/g, '-')}-${date}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const vendorProductTrend = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const windowMinutes = Number(req.query.window || 5) || 5;
    const topN = Number(req.query.top || 5) || 5;
    const date = String(req.query.date || '');
    const { start, end } = getMalaysiaDayRange(date);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(400).json({ success: false, error: 'Vendor profile not found' });
    const eventId = typeof req.query.eventId === 'string' && req.query.eventId
      ? req.query.eventId
      : await resolveCurrentVendorEventId(vendor.id);

    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          vendorId: vendor.id,
          ...(eventId ? { eventId } : {}),
          status: { in: ['PREPARING', 'READY'] },
          completedAt: { gte: start, lte: end },
        },
      },
      select: {
        quantity: true,
        order: { select: { completedAt: true } },
        menuItemId: true,
        menuItem: { select: { name: true } },
      },
      orderBy: { menuItemId: 'asc' },
    });

    const seriesMap: Record<string, { name: string; total: number; buckets: Record<string, number> }> =
      {};
    const ms = windowMinutes * 60 * 1000;
    const bucketOf = (d: Date | null): string => {
      const base = d ? new Date(d) : new Date();
      const floored = Math.floor(base.getTime() / ms) * ms;
      return new Date(floored).toISOString();
    };

    for (const it of items) {
      const id = it.menuItemId;
      const name = it.menuItem?.name || 'Unknown';
      const when = it.order?.completedAt || null;
      const bucket = bucketOf(when);

      if (!seriesMap[id]) seriesMap[id] = { name, total: 0, buckets: {} };
      seriesMap[id].total += it.quantity;
      seriesMap[id].buckets[bucket] = (seriesMap[id].buckets[bucket] || 0) + it.quantity;
    }

    const ranked = Object.entries(seriesMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, topN);

    const response = ranked.map(([id, s]) => ({
      productId: id,
      productName: s.name,
      points: Object.entries(s.buckets)
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([t, qty]) => ({ time: t, qty })),
    }));

    res.json({ success: true, data: response });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
