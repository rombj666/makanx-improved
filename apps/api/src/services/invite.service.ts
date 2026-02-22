import prisma from '../utils/prisma';
import { z } from 'zod';
import { Role } from '@makanx/shared';
import crypto from 'crypto';
import { generateToken } from '../utils/jwt';
import { hashPassword } from '../utils/password';

const acceptInviteSchema = z.object({
  token: z.string(),
  password: z.string().min(6),
});

export const verifyInvite = async (token: string) => {
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { application: true },
  });

  if (!invite) throw new Error('Invalid invite token');
  if (invite.isUsed) throw new Error('Invite token already used');
  if (new Date() > invite.expiresAt) throw new Error('Invite token expired');

  // If application linked, use that email, otherwise we don't know the email!
  // Fallback to invite.email if application not linked
  const email = invite.application?.applicantEmail || invite.email;
  const businessName = invite.application?.businessName || 'Business';

  return {
    valid: true,
    role: invite.role,
    email,
    businessName,
  };
};

export const acceptInvite = async (input: { token: string, password: string }) => {
  const { token, password } = input;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { application: true },
  });

  if (!invite) throw new Error('Invalid invite token');
  if (invite.isUsed) throw new Error('Invite token already used');
  if (new Date() > invite.expiresAt) throw new Error('Invite token expired');

  // Resolve user details
  const email = invite.application?.applicantEmail || invite.email;
  const name = invite.application?.applicantName || email.split('@')[0];
  const businessName = invite.application?.businessName || 'My Business';
  
  if (!email) {
      throw new Error('No email found for this invite');
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create User
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: invite.role, // e.g. VENDOR
      },
    });

    // 2. Create VendorProfile (if role is vendor)
    if (invite.role === 'VENDOR') {
      await tx.vendorProfile.create({
        data: {
          userId: user.id,
          businessName,
          // Map other fields from application if available
          description: invite.application?.description || `Vendor for ${businessName}`,
          phoneNumber: invite.application?.phoneNumber,
          category: invite.application?.category,
          priceRange: (invite.application?.priceMin || invite.application?.priceMax) 
             ? `${invite.application.priceMin}-${invite.application.priceMax}` 
             : undefined,
        },
      });
    }

    // 3. Mark token as used
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { isUsed: true, usedAt: new Date() },
    });
    
    // 4. Update Application status
    if (invite.applicationId) {
        await tx.vendorApplication.update({
            where: { id: invite.applicationId },
            data: { 
                status: 'ACCOUNT_CREATED',
                accountCreatedAt: new Date()
            }
        });
    }

    return user;
  });

  const authToken = generateToken({ userId: result.id, role: result.role as Role });
  return { user: { id: result.id, email: result.email, name: result.name, role: result.role }, token: authToken };
};
