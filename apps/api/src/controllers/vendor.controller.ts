import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { getMalaysiaTodayString } from '../utils/date';

const settingsSchema = z.object({
  showPrices: z.boolean().optional(),
  dailyDrinkLimitEnabled: z.boolean().optional(),
  dailyDrinkLimitQuantity: z.number().int().min(0).optional(),
  autoStopOrderingOnLimit: z.boolean().optional(),
  reportRecipientEmail: z.string().email().or(z.literal('')).optional().nullable(),
  reportRecipientEmails: z.array(z.string().email()).optional().nullable(),
});

const orderLimitSchema = z.object({
  deviceOrderLimitEnabled: z.boolean(),
  maxDrinksPerOrder: z.number().int().min(1),
});

async function vendorFor(userId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId }, include: { settings: true } });
  if (!vendor) throw new Error('Vendor profile not found');
  if (!vendor.settings) {
    vendor.settings = await prisma.vendorSettings.create({ data: { vendorId: vendor.id } });
  }
  return vendor;
}

async function activeEventUsage(vendorId: string) {
  const event = await prisma.event.findFirst({
    where: { vendorId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!event) return { event: null, usedQuantity: 0 };
  const aggregate = await prisma.orderItem.aggregate({
    where: { order: { eventId: event.id } },
    _sum: { quantity: true },
  });
  return { event, usedQuantity: Number(aggregate._sum.quantity || 0) };
}

async function saveDailyUsage(
  vendorId: string,
  date: string,
  data: {
    dailyLimit?: number;
    usedQuantity?: number;
    orderingClosed?: boolean;
  },
) {
  const existing = await prisma.vendorDailyUsage.findFirst({
    where: { vendorId, date },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return prisma.vendorDailyUsage.update({ where: { id: existing.id }, data });
  }
  return prisma.vendorDailyUsage.create({
    data: {
      vendorId,
      date,
      dailyLimit: data.dailyLimit ?? 0,
      usedQuantity: data.usedQuantity ?? 0,
      orderingClosed: data.orderingClosed ?? false,
    },
  });
}

function responseSettings(settings: any) {
  return {
    showPrices: settings.showPrices !== false,
    dailyDrinkLimitEnabled: settings.dailyLimitEnabled,
    dailyDrinkLimitQuantity: settings.dailyLimitQuantity,
    autoStopOrderingOnLimit: settings.dailyLimitAutoStop,
    reportRecipientEmail: Array.isArray(settings.reportRecipientEmails) ? settings.reportRecipientEmails[0] || null : null,
    reportRecipientEmails: Array.isArray(settings.reportRecipientEmails) ? settings.reportRecipientEmails : [],
  };
}

export const getSettings = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorFor(req.user!.userId);
    res.json({ success: true, data: responseSettings(vendor.settings) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorFor(req.user!.userId);
    const input = settingsSchema.parse(req.body);
    const emails = input.reportRecipientEmails
      ?? (input.reportRecipientEmail ? [input.reportRecipientEmail] : undefined);
    const settings = await prisma.vendorSettings.update({
      where: { vendorId: vendor.id },
      data: {
        ...(input.showPrices !== undefined ? { showPrices: input.showPrices } : {}),
        ...(input.dailyDrinkLimitEnabled !== undefined ? { dailyLimitEnabled: input.dailyDrinkLimitEnabled } : {}),
        ...(input.dailyDrinkLimitQuantity !== undefined ? { dailyLimitQuantity: input.dailyDrinkLimitQuantity } : {}),
        ...(input.autoStopOrderingOnLimit !== undefined ? { dailyLimitAutoStop: input.autoStopOrderingOnLimit } : {}),
        ...(emails !== undefined ? { reportRecipientEmails: emails } : {}),
      },
    });
    const { event, usedQuantity: eventCups } = await activeEventUsage(vendor.id);
    if (event && event.orderingStatus !== 'MANUALLY_CLOSED') {
      const limitReached = settings.dailyLimitEnabled
        && settings.dailyLimitQuantity > 0
        && eventCups >= settings.dailyLimitQuantity;
      await prisma.event.update({
        where: { id: event.id },
        data: { orderingStatus: limitReached ? 'LIMIT_REACHED' : 'OPEN' },
      });
    }
    res.json({ success: true, data: responseSettings(settings) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getOrderLimitSettings = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorFor(req.user!.userId);
    res.json({
      success: true,
      data: {
        deviceOrderLimitEnabled: vendor.settings!.deviceOrderLimitEnabled,
        maxDrinksPerOrder: vendor.settings!.maxDrinksPerOrder,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateOrderLimitSettings = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorFor(req.user!.userId);
    const input = orderLimitSchema.parse(req.body);
    const settings = await prisma.vendorSettings.update({ where: { vendorId: vendor.id }, data: input });
    res.json({ success: true, data: {
      deviceOrderLimitEnabled: settings.deviceOrderLimitEnabled,
      maxDrinksPerOrder: settings.maxDrinksPerOrder,
    } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getDailyUsage = async (req: Request, res: Response) => {
  try {
    const vendor = await vendorFor(req.user!.userId);
    const date = getMalaysiaTodayString();
    const { event, usedQuantity: used } = await activeEventUsage(vendor.id);
    const orderingClosed = event ? event.orderingStatus !== 'OPEN' : true;
    const usage = await saveDailyUsage(vendor.id, date, {
      usedQuantity: used,
      dailyLimit: vendor.settings!.dailyLimitQuantity,
      orderingClosed,
    });
    res.json({ success: true, data: { ...usage, eventId: event?.id || null, orderingClosed } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const recalculateUsage = getDailyUsage;
