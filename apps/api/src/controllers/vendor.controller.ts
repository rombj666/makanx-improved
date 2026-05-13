import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { z } from 'zod';
import { getMalaysiaDayRange, getMalaysiaTodayString } from '../utils/date';
import { getVendorDailySalesReport } from '../services/report.service';

const updateSettingsSchema = z.object({
  dailyDrinkLimitEnabled: z.boolean().optional(),
  dailyDrinkLimitQuantity: z.number().min(0).optional(),
  autoStopOrderingOnLimit: z.boolean().optional(),
  reportRecipientEmail: z.string().email().optional().nullable(),
  reportRecipientEmails: z.array(z.string().email()).optional().nullable(),
});

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

export const getDailyUsage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const today = getMalaysiaTodayString();
    let usage = await prisma.vendorDailyUsage.findUnique({
      where: { vendorId_date: { vendorId: vendor.id, date: today } },
    });

    if (!usage) {
      // Create initial usage for today if it doesn't exist
      usage = await prisma.vendorDailyUsage.create({
        data: {
          vendorId: vendor.id,
          date: today,
          dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
          usedQuantity: 0,
          orderingClosed: false,
        },
      });
    }

    return res.json({ success: true, data: usage });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const resetTodayOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor profile not found' });

    const todayStr = getMalaysiaTodayString();
    const { start, end } = getMalaysiaDayRange(todayStr);

    console.log(`[vendor-reset] Resetting today's orders for vendor ${vendor.id} (${vendor.businessName})`);
    console.log(`[vendor-reset] Range: ${start.toISOString()} to ${end.toISOString()}`);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete OrderItems for today's orders
      const orderItemsResult = await tx.orderItem.deleteMany({
        where: {
          order: {
            vendorId: vendor.id,
            createdAt: { gte: start, lte: end }
          }
        }
      });

      // 2. Delete Orders for today
      const ordersResult = await tx.order.deleteMany({
        where: {
          vendorId: vendor.id,
          createdAt: { gte: start, lte: end }
        }
      });

      // 3. Reset Daily Usage
      await tx.vendorDailyUsage.upsert({
        where: { vendorId_date: { vendorId: vendor.id, date: todayStr } },
        update: { 
          usedQuantity: 0,
          orderingClosed: false 
        },
        create: {
          vendorId: vendor.id,
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

    return res.json({ 
      success: true, 
      message: "Today's orders reset successfully",
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
    const usage = await prisma.vendorDailyUsage.upsert({
      where: { vendorId_date: { vendorId: vendor.id, date: today } },
      update: { orderingClosed: closed },
      create: {
        vendorId: vendor.id,
        date: today,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
        usedQuantity: 0,
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
    
    // Fetch all orders for today using the unified report service logic
    const report = await getVendorDailySalesReport(vendor.id, today);
    
    // Update or create usage record
    const usage = await prisma.vendorDailyUsage.upsert({
      where: { vendorId_date: { vendorId: vendor.id, date: today } },
      update: { usedQuantity: report.totalDrinks },
      create: {
        vendorId: vendor.id,
        date: today,
        dailyLimit: vendor.dailyDrinkLimitQuantity ?? 0,
        usedQuantity: report.totalDrinks,
        orderingClosed: false,
      },
    });

    return res.json({ success: true, data: usage });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
