import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || !JWT_SECRET.trim()) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export interface TokenPayload {
  userId: string;
  role: Role;
}

export const generateToken = (payload: object): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): TokenPayload => {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || payload.tokenType !== undefined ||
      typeof payload.userId !== 'string' || !payload.userId || payload.role !== Role.VENDOR) {
    throw new Error('Invalid vendor token');
  }
  return payload as TokenPayload;
};

export interface GuestTokenPayload { tokenType: 'guest'; guestId: string; }
export const generateGuestToken = (guestId: string): string =>
  jwt.sign({ tokenType: 'guest', guestId }, JWT_SECRET, { expiresIn: '365d', audience: 'guest-orders' });

export const verifyGuestToken = (token: string): GuestTokenPayload => {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], audience: 'guest-orders' });
  if (typeof payload === 'string' || payload.tokenType !== 'guest' ||
      typeof payload.guestId !== 'string' || !payload.guestId.startsWith('guest:') ||
      payload.userId !== undefined || payload.role !== undefined) {
    throw new Error('Invalid guest token');
  }
  return payload as GuestTokenPayload;
};
