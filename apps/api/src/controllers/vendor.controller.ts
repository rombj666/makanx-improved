import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { z } from 'zod';
import { getMalaysiaDayRange, getMalaysiaTodayString } from '../utils/date';
import { getIO } from '../socket';

const updateSettingsSchema = z.object({
  dailyDrinkLimitEnabled: z.boolean().optional(),
  dailyDrinkLimitQuantity: z.number().min(0).optional(),
  autoStopOrderingOnLimit: z.boolean().optional(),
  reportRecipientEmail: z.string().email().optional().nullable(),
  reportRecipientEmails: z.array(z.string().email()).optional().nullable(),
});

const updateOrderLimitSettingsSchema = z.object({
  deviceOrderLimitEnabled: z.boolean(),
  maxDrinksPerOrder: z.number().int().min(1),
});

const usageWhere = (vendorId: string, eventId: string | null, date: string) =>
  ({ vendorId_eventId_date: { vendorId, eventId, date } } as any);

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
  if (activeBooth?.eventId) return activeBooth.eventId;

  const anyBooth = await prisma.booth.findFirst({
    where: { vendorId },
    select: { eventId: true },
  });
  return anyBooth?.eventId ?? null;
}

async function ensureVendorAssignedToEvent(userId: string, eventId?: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) throw new Error('Vendor profile not found');

  const resolvedEventId = eventId || (await resolveCurrentVendorEventId(vendor.id));
  if (!resolvedEventId) throw new Error('Vendor has no current event');

  const booth = await prisma.booth.findFirst({
    where: { vendorId: vendor.id, eventId: resolvedEventId },
    select: { id: true },
  });
  if (!booth) throw new Error('Vendor is not assigned to this event');

  return { vendor, eventId: resolvedEventId };
}

async function calculateDailyUsedQuantity(vendorId: string, eventId: string | null, dateStr: string) {
  const { start, end } = getMalaysiaDayRange(dateStr);
  const sum = await prisma.orderItem.aggregate({
    where: {
      order: {
        vendorId,
        ...(eventId ? { eventId } : {}),
        createdAt: { gte: start, lte: end },
        status: { in: ['PREPARING', 'READY'] },
      },
    },
    _sum: { quantity: true },
  });
  return Number(sum?._sum?.quantity ?? 0);
}

export const getSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        dailyDrinkLimitEnabled: true,
        dailyDrinkLimitQuantity: true,
        autoStopOrderingOnLimit: true,
        reportRecipientEmail: true,
        reportRecipientEmails: true,
      },
    });

    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    // Ensure we return default values if null in DB (unlikely with Prisma defaults but safe)
    // Also handle migration logic: if old field has email but new field is empty, return [old]
    let emails: string[] = [];
    if (vendor.reportRecipientEmails && Array.isArray(vendor.reportRecipientEmails)) {
      emails = vendor.reportRecipientEmails as string[];
    } else if (vendor.reportRecipientEmail) {
      emails = [vendor.reportRecipientEmail];
    }

    const data = {
      dailyDrinkLimitEnabled: vendor.dailyDrinkLimitEnabled ?? false,
      dailyDrinkLimitQuantity: vendor.dailyDrinkLimitQuantity ?? 0,
      autoStopOrderingOnLimit: vendor.autoStopOrderingOnLimit ?? true,
      reportRecipientEmail: vendor.reportRecipientEmail ?? null,
      reportRecipientEmails: emails,
    };

    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const validatedData = updateSettingsSchema.parse(req.body);

    const updateData: any = { ...validatedData };
    if (updateData.reportRecipientEmails === null) {
      updateData.reportRecipientEmails = undefined; // Or []
    }

    const vendor = await prisma.vendorProfile.update({
      where: { userId },
      data: updateData,
      select: {
        id: true,
        dailyDrinkLimitEnabled: true,
        dailyDrinkLimitQuantity: true,
        autoStopOrderingOnLimit: true,
        reportRecipientEmail: true,
        reportRecipientEmails: true,
      },
    });

    // Also update today's usage record if it exists and limit was changed
    if (validatedData.dailyDrinkLimitQuantity !== undefined) {
      const today = getMalaysiaTodayString();
      await prisma.vendorDailyUsage.updateMany({
        where: { vendorId: vendor.id, date: today },
        data: { dailyLimit: validatedData.dailyDrinkLimitQuantity },
      });
    }

    // Combine for frontend
    let emails: string[] = [];
    if (vendor.reportRecipientEmails && Array.isArray(vendor.reportRecipientEmails)) {
      emails = vendor.reportRecipientEmails as string[];
    } else if (vendor.reportRecipientEmail) {
      emails = [vendor.reportRecipientEmail];
    }

    const data = {
      ...vendor,
      reportRecipientEmails: emails,
    };

    return res.json({ success: true, data });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues.map((issue) => issue.message) });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getOrderLimitSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { eventId } = await ensureVendorAssignedToEvent(userId, req.params.eventId);
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { deviceOrderLimitEnabled: true, maxDrinksPerOrder: true },
    });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    return res.json({
      success: true,
      data: {
        deviceOrderLimitEnabled: event.deviceOrderLimitEnabled ?? false,
        maxDrinksPerOrder: event.maxDrinksPerOrder ?? 1,
      },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const updateOrderLimitSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const validatedData = updateOrderLimitSettingsSchema.parse(req.body);
    const { eventId } = await ensureVendorAssignedToEvent(userId, req.params.eventId);

    const event = await prisma.event.update({
      where: { id: eventId },
      data: validatedData,
      select: { deviceOrderLimitEnabled: true, maxDrinksPerOrder: true },
    });

    return res.json({ success: true, data: event });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues.map((issue) => issue.message).join(', ') });
    }
    return res.status(400).json({ success: false, error: error.message });
  }
};

export const getDailyUsage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const today = getMalaysiaTodayString();
    const eventId = await resolveCurrentVendorEventId(vendor.id);
    const usedQuantity = await calculateDailyUsedQuantity(vendor.id, eventId, today);
    let usage = await prisma.vendorDailyUsage.findUnique({
      where: usageWhere(vendor.id, eventId, today),
    });

    if (!usage) {
      // Create initial usage for today if it doesn't exist
      usage = await prisma.vendorDailyUsage.create({
        data: {
          vendorId: vendor.id,
          eventId,
          date: today,
          dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
          usedQuantity,
          orderingClosed: false,
        },
      });
    } else if (usage.usedQuantity !== usedQuantity || usage.dailyLimit !== (vendor.dailyDrinkLimitQuantity ?? 0)) {
      usage = await prisma.vendorDailyUsage.update({
        where: { id: usage.id },
        data: {
          usedQuantity,
          dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
        },
      });
    }

    return res.json({ success: true, data: usage });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const resetEventOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const eventId = await resolveCurrentVendorEventId(vendor.id);
    if (!eventId) return res.status(400).json({ success: false, error: 'Vendor has no current event' });

    const todayStr = getMalaysiaTodayString();

    console.log(`[vendor-reset] Resetting event orders for vendor ${vendor.id} (${vendor.businessName}) in event ${eventId}`);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete OrderItems for this event's orders
      const orderItemsResult = await tx.orderItem.deleteMany({
        where: {
          order: {
            vendorId: vendor.id,
            eventId,
          }
        }
      });

      // 2. Delete Orders for this event
      const ordersResult = await tx.order.deleteMany({
        where: {
          vendorId: vendor.id,
          eventId,
        }
      });

      // 3. Reset today's usage because the underlying event orders are gone.
      await tx.vendorDailyUsage.upsert({
        where: usageWhere(vendor.id, eventId, todayStr),
        update: { 
          usedQuantity: 0,
          dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
          orderingClosed: false 
        },
        create: {
          vendorId: vendor.id,
          eventId,
          date: todayStr,
          dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
          usedQuantity: 0,
          orderingClosed: false
        }
      });

      return {
        deletedOrders: ordersResult.count,
        deletedOrderItems: orderItemsResult.count
      };
    });

    getIO().to(`vendor:${vendor.id}`).emit('vendor_orders_reset', { vendorId: vendor.id, eventId });
    getIO().to(`vendor:${vendor.id}`).emit('vendor_orders_changed', {
      reset: true,
      vendorId: vendor.id,
      eventId,
      updatedAt: new Date().toISOString(),
    });
    getIO().emit('vendor_serving_updated', { vendorId: vendor.id, displayNumber: null });

    return res.json({ 
      success: true, 
      message: "Event orders reset successfully",
      ...result
    });
  } catch (error: any) {
    console.error(`[vendor-reset] Error: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const toggleOrderingStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { closed } = z.object({ closed: z.boolean() }).parse(req.body);

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const today = getMalaysiaTodayString();
    const eventId = await resolveCurrentVendorEventId(vendor.id);
    const usedQuantity = await calculateDailyUsedQuantity(vendor.id, eventId, today);
    const usage = await prisma.vendorDailyUsage.upsert({
      where: usageWhere(vendor.id, eventId, today),
      update: {
        orderingClosed: closed,
        usedQuantity,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
      },
      create: {
        vendorId: vendor.id,
        eventId,
        date: today,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
        usedQuantity,
        orderingClosed: closed,
      },
    });

    return res.json({ success: true, data: usage });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues.map((issue) => issue.message) });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const recalculateUsage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const today = getMalaysiaTodayString();
    const eventId = await resolveCurrentVendorEventId(vendor.id);
    const usedQuantity = await calculateDailyUsedQuantity(vendor.id, eventId, today);
    
    // Update or create usage record
    const usage = await prisma.vendorDailyUsage.upsert({
      where: usageWhere(vendor.id, eventId, today),
      update: {
        usedQuantity,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
      },
      create: {
        vendorId: vendor.id,
        eventId,
        date: today,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
        usedQuantity,
        orderingClosed: false,
      },
    });

    return res.json({ success: true, data: usage });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
