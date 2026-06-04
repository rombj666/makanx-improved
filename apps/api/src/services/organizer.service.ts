import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

export const getVendors = async (active?: boolean, eventId?: string) => {
  const where: any = {
    role: Role.VENDOR,
  };

  if (active !== undefined) {
    where.isActive = active;
  }

  if (eventId) {
    const apps = await prisma.vendorApplication.findMany({
      where: {
        eventId,
        status: { in: ['APPROVED', 'ACCOUNT_CREATED'] as any },
      },
      select: { applicantEmail: true },
    });
    const emails = apps.map((a) => a.applicantEmail).filter(Boolean);

    where.OR = [
      {
        vendorProfile: {
          booths: {
            some: { eventId },
          },
        },
      },
      emails.length
        ? {
            email: { in: emails },
          }
        : undefined,
    ].filter(Boolean);
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
          id: true,
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
