import prisma from '../utils/prisma';
import { Role, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

export const createApplication = async (data: any) => {
  // Assuming data matches VendorApplicationCreateInput or similar
  // Since we don't have exact types from user, we'll just map fields loosely
  // or pass data directly if it matches.
  // For now, let's assume 'eventId' is in data.
  
  // Basic validation or transformation could happen here
  return prisma.vendorApplication.create({
    data: {
      eventId: data.eventId,
      applicantName: data.applicantName,
      applicantEmail: data.applicantEmail,
      businessName: data.businessName,
      status: 'PENDING',
      // Map other fields as needed
    },
  });
};

export const getApplications = async (organizerId: string) => {
  // Verify organizer owns the events? 
  // For simplicity, find applications for events owned by this organizer
  return prisma.vendorApplication.findMany({
    where: {
      event: {
        organizerId: organizerId,
      },
    },
    include: {
      event: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const approveApplication = async (applicationId: string, organizerId: string) => {
  const application = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
    include: { event: true },
  });

  if (!application) throw new Error('Application not found');
  if (application.event.organizerId !== organizerId) throw new Error('Unauthorized');
  if (application.status === 'APPROVED') throw new Error('Application already approved');

  // Transaction: Update status and create invite token
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.vendorApplication.update({
      where: { id: applicationId },
      data: { status: 'APPROVED' },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const inviteToken = await tx.inviteToken.create({
      data: {
        token,
        role: Role.VENDOR,
        eventId: application.eventId,
        applicationId: application.id,
        expiresAt,
      },
    });

    return inviteToken;
  });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const inviteUrl = `${clientUrl}/invite?token=${result.token}`;

  return { ...result, inviteUrl };
};

export const rejectApplication = async (applicationId: string, organizerId: string) => {
    const application = await prisma.vendorApplication.findUnique({
      where: { id: applicationId },
      include: { event: true },
    });
  
    if (!application) throw new Error('Application not found');
    if (application.event.organizerId !== organizerId) throw new Error('Unauthorized');
  
    return prisma.vendorApplication.update({
      where: { id: applicationId },
      data: { status: 'REJECTED' },
    });
  };
