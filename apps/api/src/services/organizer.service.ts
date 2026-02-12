import prisma from '../utils/prisma';
import { Role } from '@makanx/shared';

export const getVendors = async (active?: boolean) => {
  const where: any = {
    role: Role.VENDOR,
  };

  if (active !== undefined) {
    where.isActive = active;
  }

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      vendorProfile: {
        select: {
          businessName: true,
          description: true,
          phoneNumber: true,
          category: true,
          priceRange: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const updateVendorStatus = async (id: string, isActive: boolean) => {
  return prisma.user.update({
    where: { id },
    data: { isActive },
  });
};
