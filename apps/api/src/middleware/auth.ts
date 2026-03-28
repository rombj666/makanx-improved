import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { Role } from '@makanx/shared';
import prisma from '../utils/prisma';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token missing' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
  } catch (error) {
    // Ignore invalid token in optional auth
  }
  next();
};

export const requireRole = (roles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const tokenRole = req.user.role;
    if (roles.includes(tokenRole)) {
      return next();
    }

    let dbRole: Role | null = null;
    try {
      const found = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true },
      });
      dbRole = (found?.role as Role) || null;
    } catch {}

    if (dbRole && roles.includes(dbRole)) {
      req.user.role = dbRole;
      return next();
    }

    console.warn('[auth] 403 forbidden', {
      userId: req.user.userId,
      tokenRole,
      dbRole,
      requiredRoles: roles,
      method: req.method,
      path: req.originalUrl,
      boothId: (req.params as any)?.id || null,
    });

    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
  };
};
