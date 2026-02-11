import prisma from '../utils/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { Role } from '@makanx/shared';
import { z } from 'zod';
import { randomInt } from 'crypto';
import { sendPasswordResetEmail } from './email.service';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.nativeEnum(Role).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const requestResetSchema = z.object({
  email: z.string().email(),
});

const confirmResetSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
});

export const register = async (input: unknown) => {
  const parsed = registerSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const { password, name, role } = parsed;
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: role || Role.CUSTOMER,
    },
  });

  const token = generateToken({ userId: user.id, role: user.role as Role });
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token };
};

export const login = async (input: unknown) => {
  const parsed = loginSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const { password } = parsed;

  const user = await prisma.user.findUnique({ where: { email } });

  console.log('[Auth Debug] Login attempt:', {
    email,
    userFound: !!user,
    role: user?.role,
    isActive: user?.isActive,
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  
  console.log('[Auth Debug] Password check:', {
    isPasswordValid,
  });

  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  // Check if account is active (for vendors)
  if (user.role === Role.VENDOR && !user.isActive) {
    throw new Error('Vendor account disabled. Contact organizer.');
  }

  const token = generateToken({ userId: user.id, role: user.role as Role });
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
};

export const requestPasswordReset = async (input: unknown) => {
  const parsed = requestResetSchema.parse(input);
  const email = normalizeEmail(parsed.email);

  console.log("[reset] Request received for:", email);
  console.log("[reset] Resend ENV check:", {
    RESEND_API_KEY_EXISTS: !!process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Return success to avoid email enumeration
    return { message: 'If an account exists, a reset code has been sent.' };
  }

  // Generate 6 digit OTP
  const otp = randomInt(100000, 999999).toString();
  const otpHash = await hashPassword(otp); // Reuse bcrypt wrapper

  // Create token
  await prisma.passwordResetToken.create({
    data: {
      email,
      otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
  });

  // Send email
  try {
    console.log("[reset] Attempting to send OTP via Resend to:", email);
    const result = await sendPasswordResetEmail(email, otp);
    console.log("[reset] email send result:", result);
  } catch (err) {
    console.error("[reset] Email send failed:", err);
    // Optionally rethrow if you want the client to know, but usually we hide this detail
    // and rely on logs for debugging to prevent enumeration/attacks. 
    // For debugging request, we are logging it.
  }

  return { message: 'If an account exists, a reset code has been sent.' };
};

export const confirmPasswordReset = async (input: unknown) => {
  const parsed = confirmResetSchema.parse(input);
  const email = normalizeEmail(parsed.email);
  const { otp, newPassword } = parsed;

  // Find latest valid token
  const token = await prisma.passwordResetToken.findFirst({
    where: {
      email,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!token) {
    throw new Error('Invalid or expired reset code');
  }

  if (token.attempts >= 5) {
    throw new Error('Too many failed attempts. Please request a new code.');
  }

  const isValid = await comparePassword(otp, token.otpHash);
  if (!isValid) {
    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    throw new Error('Invalid reset code');
  }

  // Update password and mark token used
  const hashedPassword = await hashPassword(newPassword);
  
  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { message: 'Password reset successfully' };
};
