import prisma from '../utils/prisma';
import { z } from 'zod';

function isMissingColumnError(e: any, columnName: string) {
  const msg = String(e?.message || '');
  return msg.includes('column') && msg.includes(columnName) && msg.includes('does not exist');
}

const optionChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  priceDelta: z.number().optional(),
});

const optionGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['single', 'multi']),
  required: z.boolean().default(false),
  choices: z.array(optionChoiceSchema).default([]),
});

const menuItemInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  imageUrl: z.string().optional(),
  isAvailable: z.boolean().optional(),
  remarksEnabled: z.boolean().optional(),
  optionGroups: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    }, z.array(optionGroupSchema))
    .optional(),
});

export const createMenuItem = async (userId: string, data: any) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  const parsed = menuItemInputSchema.parse(data);
  try {
    return await prisma.menuItem.create({
      data: {
        vendorId: vendorProfile.id,
        name: parsed.name,
        description: parsed.description || null,
        price: parsed.price,
        imageUrl: parsed.imageUrl || null,
        isAvailable: parsed.isAvailable ?? true,
        remarksEnabled: parsed.remarksEnabled ?? true,
        optionGroups: parsed.optionGroups ?? [],
      },
    });
  } catch (e: any) {
    if (isMissingColumnError(e, 'optionGroups') || isMissingColumnError(e, 'remarksEnabled')) {
      return prisma.menuItem.create({
        data: {
          vendorId: vendorProfile.id,
          name: parsed.name,
          description: parsed.description || null,
          price: parsed.price,
          imageUrl: parsed.imageUrl || null,
          isAvailable: parsed.isAvailable ?? true,
        } as any,
      });
    }
    throw e;
  }
};

export const getVendorMenu = async (userId: string) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  try {
    return await prisma.menuItem.findMany({
      where: { vendorId: vendorProfile.id, isAvailable: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
        optionGroups: true,
        remarksEnabled: true,
      },
    });
  } catch (e: any) {
    if (isMissingColumnError(e, 'optionGroups') || isMissingColumnError(e, 'remarksEnabled')) {
      const items = await prisma.menuItem.findMany({
        where: { vendorId: vendorProfile.id, isAvailable: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vendorId: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          isAvailable: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return items.map((it: any) => ({ ...it, optionGroups: [], remarksEnabled: true }));
    }
    throw e;
  }
};

export const updateMenuItem = async (
  userId: string,
  itemId: string,
  data: any
) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
  });

  if (!vendorProfile) throw new Error('Vendor profile not found');

  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, vendorId: vendorProfile.id },
  });
  if (!existing) throw new Error('Menu item not found');

  const parsed = menuItemInputSchema.partial().parse(data);
  const updateData: any = {};
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.description !== undefined) updateData.description = parsed.description || null;
  if (parsed.price !== undefined) updateData.price = parsed.price;
  if (parsed.imageUrl !== undefined) updateData.imageUrl = parsed.imageUrl || null;
  if (parsed.isAvailable !== undefined) updateData.isAvailable = parsed.isAvailable;
  if (parsed.remarksEnabled !== undefined) updateData.remarksEnabled = parsed.remarksEnabled;
  if (parsed.optionGroups !== undefined) updateData.optionGroups = parsed.optionGroups;

  try {
    return await prisma.menuItem.update({
      where: { id: itemId },
      data: updateData,
    });
  } catch (e: any) {
    if (
      (isMissingColumnError(e, 'optionGroups') || isMissingColumnError(e, 'remarksEnabled')) &&
      (updateData.optionGroups !== undefined || updateData.remarksEnabled !== undefined)
    ) {
      const fallback = { ...updateData };
      delete (fallback as any).optionGroups;
      delete (fallback as any).remarksEnabled;
      return prisma.menuItem.update({
        where: { id: itemId },
        data: fallback,
      });
    }
    throw e;
  }
};

export const deleteMenuItem = async (
  userId: string,
  itemId: string
) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId },
  });

  if (!vendorProfile) throw new Error('Vendor profile not found');

  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, vendorId: vendorProfile.id },
  });
  if (!existing) throw new Error('Menu item not found');

  const linkedCount = await prisma.orderItem.count({ where: { menuItemId: itemId } });
  if (linkedCount > 0) {
    return prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable: false },
    });
  }

  return prisma.menuItem.delete({ where: { id: itemId } });
};
