import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { Role } from '@makanx/shared';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'super-secret-key-change-me';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export interface TokenPayload {
  userId: string;
  role: Role;
}

export const generateToken = (payload: object): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
