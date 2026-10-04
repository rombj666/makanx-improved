import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload, verifyGuestToken, GuestTokenPayload } from '../utils/jwt';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { vendorTokenFromRequest } from '../utils/vendor-auth-cookie';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      guest?: GuestTokenPayload;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = vendorTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
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
  const token = vendorTokenFromRequest(req);
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

    const requiredRoles = roles.map(r => String(r).toUpperCase());
    const tokenRole = String(req.user.role || '').toUpperCase();

    if (tokenRole && requiredRoles.includes(tokenRole)) {
      return next();
    }

    let dbRole: string | null = null;
    try {
      const found = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true },
      });
      dbRole = found?.role ? String(found.role).toUpperCase() : null;
    } catch {
      console.error('Authorization role lookup failed');
    }

    if (dbRole && requiredRoles.includes(dbRole)) {
      req.user.role = dbRole as Role;
      return next();
    }

    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
  };
};

// Order reads accept either credential; guest-only routes never accept vendor JWTs.
export const requireOrderAuth = (req: Request, res: Response, next: NextFunction) => {
  const vendorToken = vendorTokenFromRequest(req);
  if (vendorToken) {
    try { req.user = verifyToken(vendorToken); return next(); } catch {}
  }
  const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization || '');
  if (match) {
    try { req.user = verifyToken(match[1]); return next(); } catch {}
    try { req.guest = verifyGuestToken(match[1]); return next(); } catch {}
  }
  return res.status(401).json({ success: false, error: 'Unauthorized' });
};

export const requireGuestAuth = (req: Request, res: Response, next: NextFunction) => {
  const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization || '');
  if (match) {
    try { req.guest = verifyGuestToken(match[1]); return next(); } catch {}
  }
  return res.status(401).json({ success: false, error: 'Unauthorized' });
};
