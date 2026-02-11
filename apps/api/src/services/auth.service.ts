import prisma from '../utils/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { Role } from '@makanx/shared';
import { z } from 'zod';

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

export const register = async (input: unknown) => {
  const { email, password, name, role } = registerSchema.parse(input);

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
  const { email, password } = loginSchema.parse(input);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
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
