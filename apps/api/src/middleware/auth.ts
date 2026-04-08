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

    // Normalize roles for comparison
    const requiredRoles = roles.map(r => String(r).toUpperCase());
    const tokenRole = String(req.user.role || '').toUpperCase();

    console.log('[auth] requireRole check started', { 
      userId: req.user.userId, 
      tokenRole, 
      requiredRoles,
      originalPath: req.originalUrl
    });

    if (tokenRole && requiredRoles.includes(tokenRole)) {
      console.log('[auth] role matched from token', { userId: req.user.userId, role: tokenRole });
      return next();
    }

    let dbRole: string | null = null;
    try {
      const found = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true },
      });
      dbRole = found?.role ? String(found.role).toUpperCase() : null;
    } catch (e: any) {
      console.error('[auth] dbRole lookup failed', { userId: req.user.userId, error: e.message });
    }

    console.log('[auth] dbRole lookup result', { userId: req.user.userId, dbRole });

    if (dbRole && requiredRoles.includes(dbRole)) {
      console.log('[auth] role matched from database', { userId: req.user.userId, role: dbRole });
      req.user.role = dbRole as Role;
      return next();
    }

    console.warn('[auth] 403 forbidden - exact mismatch', {
      userId: req.user.userId,
      tokenRole,
      dbRole,
      requiredRoles,
      method: req.method,
      path: req.originalUrl,
    });

    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
  };
};
