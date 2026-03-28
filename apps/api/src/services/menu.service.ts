import prisma from '../utils/prisma';
import { z } from 'zod';

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
  optionGroups: z.array(optionGroupSchema).optional(),
});

export const createMenuItem = async (userId: string, data: any) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  const parsed = menuItemInputSchema.parse(data);
  return prisma.menuItem.create({
    data: {
      vendorId: vendorProfile.id,
      name: parsed.name,
      description: parsed.description || null,
      price: parsed.price,
      imageUrl: parsed.imageUrl || null,
      isAvailable: parsed.isAvailable ?? true,
      remarksEnabled: parsed.remarksEnabled ?? true,
      optionGroups: parsed.optionGroups ?? [],
    }
  });
};

export const getVendorMenu = async (userId: string) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  return prisma.menuItem.findMany({
    where: { vendorId: vendorProfile.id },
    orderBy: { createdAt: "desc" }
  });
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

  return prisma.menuItem.update({
    where: { id: itemId },
    data: updateData,
  });
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

  return prisma.menuItem.delete({
    where: { id: itemId },
  });
};
