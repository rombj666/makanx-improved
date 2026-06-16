import { Request, Response } from 'express';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { formatMalaysiaDateTime, getMalaysiaDayRange } from '../utils/date';
import { generateVendorSalesExcel } from '../services/excel.service';

const VALID_SALES_STATUSES: OrderStatus[] = [OrderStatus.READY];

type SalesOrder = {
  id: string;
  displayNumber: number;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  completedAt: Date | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    price: Prisma.Decimal;
    remark: string | null;
    selectedOptions: Prisma.JsonValue;
    menuItem: {
      name: string;
    };
  }>;
};

function orderSalesAmount(order: Pick<SalesOrder, 'items' | 'totalAmount'>) {
  const itemTotal = order.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return itemTotal || Number(order.totalAmount);
}

async function context(req: Request) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!vendor) throw new Error('Vendor profile not found');
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const range = getMalaysiaDayRange(date);
  return { vendor, date, ...range };
}

async function ordersFor(req: Request) {
  const ctx = await context(req);
  const where: Prisma.OrderWhereInput = {
    vendorId: ctx.vendor.id,
    paymentStatus: PaymentStatus.PAID,
    status: { in: VALID_SALES_STATUSES },
    createdAt: { gte: ctx.start, lt: ctx.end },
  };
  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      displayNumber: true,
      totalAmount: true,
      createdAt: true,
      completedAt: true,
      items: {
        select: {
          menuItemId: true,
          quantity: true,
          price: true,
          remark: true,
          selectedOptions: true,
          menuItem: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const matchingOrderItems = orders.reduce((sum, order) => sum + order.items.length, 0);
  const matchingRevenue = orders.reduce((sum, order) => sum + orderSalesAmount(order), 0);
  console.info('[analytics:sales-report]', {
    selectedDate: ctx.date,
    malaysiaRange: {
      start: formatMalaysiaDateTime(ctx.start),
      endExclusive: formatMalaysiaDateTime(ctx.end),
    },
    utcRange: {
      start: ctx.start.toISOString(),
      endExclusive: ctx.end.toISOString(),
    },
    vendorId: ctx.vendor.id,
    orderFilter: {
      paymentStatus: PaymentStatus.PAID,
      statuses: VALID_SALES_STATUSES,
    },
    matchingOrders: orders.length,
    matchingOrderItems,
    matchingRevenue,
  });
  return { ...ctx, orders: orders as SalesOrder[] };
}

export const vendorSalesSummary = async (req: Request, res: Response) => {
  try {
    const { orders } = await ordersFor(req);
    const revenue = orders.reduce((sum, order) => sum + orderSalesAmount(order), 0);
    res.json({ success: true, data: { orders: orders.length, revenue, avgOrder: orders.length ? revenue / orders.length : 0 } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const vendorProductPerformance = async (req: Request, res: Response) => {
  try {
    const { orders } = await ordersFor(req);
    const products = new Map<string, any>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = products.get(item.menuItemId) || {
          productName: item.menuItem.name,
          qtySold: 0,
          revenue: 0,
          optionBreakdown: {},
          remarks: [],
        };
        current.qtySold += item.quantity;
        current.revenue += Number(item.price) * item.quantity;
        if (item.remark) current.remarks.push(item.remark);
        products.set(item.menuItemId, current);
      }
    }
    res.json({ success: true, data: Array.from(products.values()) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const productPerformance = vendorProductPerformance;

export const vendorRevenueTrend = async (req: Request, res: Response) => {
  try {
    const { orders } = await ordersFor(req);
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0 }));
    for (const order of orders) {
      const hour = new Date(order.createdAt.getTime() + 8 * 60 * 60 * 1000).getUTCHours();
      buckets[hour].revenue += Number(order.totalAmount);
    }
    res.json({ success: true, data: buckets });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const vendorProductTrend = async (req: Request, res: Response) => {
  try {
    const { orders } = await ordersFor(req);
    const series = new Map<string, any>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = series.get(item.menuItemId) || { productId: item.menuItemId, productName: item.menuItem.name, points: [] };
        current.points.push({ time: order.createdAt.toISOString(), qty: item.quantity });
        series.set(item.menuItemId, current);
      }
    }
    res.json({ success: true, data: Array.from(series.values()) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const vendorCompletedOrders = async (req: Request, res: Response) => {
  try {
    const { orders } = await ordersFor(req);
    res.json({ success: true, data: orders.map((order) => ({
      orderNumber: `#${order.displayNumber}`,
      totalAmount: orderSalesAmount(order),
      createdAt: order.createdAt,
      completedAt: order.completedAt,
      items: order.items.map((item) => ({
        productName: item.menuItem.name,
        qty: item.quantity,
        price: Number(item.price),
        remark: item.remark,
        selectedOptions: item.selectedOptions,
      })),
    })) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const vendorExportReport = async (req: Request, res: Response) => {
  try {
    const { vendor, date, orders } = await ordersFor(req);
    const buffer = await generateVendorSalesExcel(vendor.businessName, date, orders as any);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vendor-sales-${date}.xlsx`);
    res.send(buffer);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
