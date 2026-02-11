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

  return {
    valid: true,
    role: invite.role,
    email: invite.application?.applicantEmail,
    businessName: invite.application?.businessName,
  };
};

export const acceptInvite = async (input: z.infer<typeof acceptInviteSchema>) => {
  const { token, password } = acceptInviteSchema.parse(input);

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { application: true },
  });

  if (!invite) throw new Error('Invalid invite token');
  if (invite.isUsed) throw new Error('Invite token already used');
  if (new Date() > invite.expiresAt) throw new Error('Invite token expired');

  // If application linked, use that email, otherwise we don't know the email!
  // Assumption: Vendor Invite MUST be linked to application OR we need email in input.
  // Given previous step, we linked application.
  
  if (!invite.application) {
    throw new Error('Invite not linked to any application data');
  }

  const email = invite.application.applicantEmail;
  const name = invite.application.applicantName;
  const businessName = invite.application.businessName;

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
        role: invite.role,
      },
    });

    // 2. Create VendorProfile
    if (invite.role === Role.VENDOR) {
      await tx.vendorProfile.create({
        data: {
          userId: user.id,
          businessName,
          description: `Vendor for ${businessName}`,
        },
      });
    }

    // 3. Mark token as used
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { isUsed: true },
    });

    return user;
  });

  const authToken = generateToken({ userId: result.id, role: result.role as Role });
  return { user: { id: result.id, email: result.email, name: result.name, role: result.role }, token: authToken };
};
