import prisma from '../utils/prisma';
import { z } from 'zod';
import crypto from 'crypto';

function isMissingColumnError(e: any, columnName: string) {
  const msg = String(e?.message || '');
  return msg.includes('column') && msg.includes(columnName) && msg.includes('does not exist');
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
}

function sanitizeOptionGroups(input: any): any[] | undefined {
  const raw = typeof input === 'string'
    ? (() => {
        try {
          return JSON.parse(input);
        } catch {
          return input;
        }
      })()
    : input;

  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;

  const groups = raw
    .map((g: any) => {
      const title = String(g?.title || '').trim();
      if (!title) return null;
      const type = g?.type === 'multi' ? 'multi' : 'single';
      const required = !!g?.required;
      const choicesRaw = Array.isArray(g?.choices) ? g.choices : [];
      const choices = choicesRaw
        .map((c: any) => {
          const label = String(c?.label || '').trim();
          if (!label) return null;
          return {
            id: String(c?.id || newId()),
            label,
            priceDelta: typeof c?.priceDelta === 'number' ? c.priceDelta : undefined,
          };
        })
        .filter(Boolean);
      if (choices.length === 0) return null;
      return { id: String(g?.id || newId()), title, type, required, choices };
    })
    .filter(Boolean);

  return groups;
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
  displayOrder: z.number().int().nonnegative().optional(),
  optionGroups: z.preprocess((val) => sanitizeOptionGroups(val), z.array(optionGroupSchema)).optional(),
});

export const createMenuItem = async (userId: string, data: any) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  const parsed = menuItemInputSchema.parse(data);
  let nextDisplayOrder: number | undefined;
  try {
    const agg = await prisma.menuItem.aggregate({
      where: { vendorId: vendorProfile.id },
      _max: { displayOrder: true },
    });
    nextDisplayOrder = Number(agg?._max?.displayOrder ?? 0) + 1;
  } catch (e: any) {
    if (!isMissingColumnError(e, 'displayOrder')) {
      throw e;
    }
  }
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
        ...(typeof nextDisplayOrder === 'number' ? { displayOrder: nextDisplayOrder } : {}),
        optionGroups: parsed.optionGroups ?? [],
      },
    });
  } catch (e: any) {
    if (
      isMissingColumnError(e, 'optionGroups') ||
      isMissingColumnError(e, 'remarksEnabled') ||
      isMissingColumnError(e, 'displayOrder')
    ) {
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
      where: { vendorId: vendorProfile.id },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        isAvailable: true,
        displayOrder: true,
        createdAt: true,
        updatedAt: true,
        optionGroups: true,
        remarksEnabled: true,
      },
    });
  } catch (e: any) {
    if (
      isMissingColumnError(e, 'optionGroups') ||
      isMissingColumnError(e, 'remarksEnabled') ||
      isMissingColumnError(e, 'displayOrder')
    ) {
      const items = await prisma.menuItem.findMany({
        where: { vendorId: vendorProfile.id },
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
      return items
        .map((it: any, idx: number) => ({
          ...it,
          displayOrder: idx + 1,
          optionGroups: [],
          remarksEnabled: true,
        }))
        .sort((a: any, b: any) => Number(a.displayOrder) - Number(b.displayOrder));
    }
    throw e;
  }
};

export const getPublicMenu = async (vendorId: string) => {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      slug: true,
      businessName: true,
      description: true,
      category: true,
      settings: {
        select: {
          orderingOpen: true,
          showPrices: true,
          deviceOrderLimitEnabled: true,
          maxDrinksPerOrder: true,
        },
      },
      menuItems: {
        where: { isAvailable: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          optionGroups: true,
          remarksEnabled: true,
        },
      },
    },
  });
  if (!vendor) throw new Error('Store not found');
  return {
    ...vendor,
    menuItems: vendor.menuItems.map((item) => ({ ...item, price: Number(item.price) })),
  };
};

export const getPublicMenuBySlug = async (slug: string) => {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      businessName: true,
      description: true,
      category: true,
      settings: {
        select: {
          orderingOpen: true,
          showPrices: true,
          deviceOrderLimitEnabled: true,
          maxDrinksPerOrder: true,
        },
      },
      menuItems: {
        where: { isAvailable: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          optionGroups: true,
          remarksEnabled: true,
        },
      },
    },
  });
  if (!vendor) throw new Error('Store not found');
  return {
    ...vendor,
    menuItems: vendor.menuItems.map((item) => ({ ...item, price: Number(item.price) })),
  };
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
    select: { id: true },
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
  if (parsed.displayOrder !== undefined) updateData.displayOrder = parsed.displayOrder;
  if (parsed.optionGroups !== undefined) updateData.optionGroups = parsed.optionGroups;

  try {
    return await prisma.menuItem.update({
      where: { id: itemId },
      data: updateData,
    });
  } catch (e: any) {
    if (isMissingColumnError(e, 'optionGroups') || isMissingColumnError(e, 'remarksEnabled') || isMissingColumnError(e, 'displayOrder')) {
      const fallback = { ...updateData };
      delete (fallback as any).optionGroups;
      delete (fallback as any).remarksEnabled;
      delete (fallback as any).displayOrder;
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
    select: { id: true, vendorId: true, isAvailable: true },
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
