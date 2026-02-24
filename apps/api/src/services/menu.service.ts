import prisma from '../utils/prisma';
export const createMenuItem = async (userId: string, data: any) => {
  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { userId }
  });

  if (!vendorProfile) {
    throw new Error("Vendor profile not found");
  }

  return prisma.menuItem.create({
    data: {
      vendorId: vendorProfile.id,
      name: data.name,
      description: data.description || null,
      price: data.price,
      imageUrl: data.imageUrl || null
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

  return prisma.menuItem.update({
    where: { id: itemId },
    data,
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

  return prisma.menuItem.delete({
    where: { id: itemId },
  });
};