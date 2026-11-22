import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload, verifyGuestToken, GuestTokenPayload } from '../utils/jwt';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';
import { vendorTokenFromRequest } from '../utils/vendor-auth-cookie';
import { vendorForUser } from '../utils/vendor-access';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      guest?: GuestTokenPayload;
      vendorAccess?: { permission: 'ADMIN' | 'BARISTA'; vendorId: string; ownerUserId: string };
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
    void prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true, permission: true, vendorId: true, vendorProfile: { select: { id: true, userId: true } } },
    }).then((account) => {
      const vendorId = account?.vendorProfile?.id || account?.vendorId;
      const ownerUserId = account?.vendorProfile?.userId || (account?.vendorId ? undefined : undefined);
      if (!account?.isActive || !vendorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      return prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { userId: true } }).then((vendor) => {
        if (!vendor) return res.status(401).json({ success: false, error: 'Unauthorized' });
        req.vendorAccess = { permission: account.permission, vendorId, ownerUserId: ownerUserId || vendor.userId };
        next();
      });
    }).catch(() => res.status(401).json({ success: false, error: 'Unauthorized' }));
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
    if (requiredRoles.includes(String(req.user.role).toUpperCase()) && req.vendorAccess) return next();

    return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
  };
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.vendorAccess) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.vendorAccess.permission !== 'ADMIN') return res.status(403).json({ success: false, error: 'Forbidden: Admin permission required' });
  next();
};

// Order reads accept either credential; guest-only routes never accept vendor JWTs.
export const requireOrderAuth = async (req: Request, res: Response, next: NextFunction) => {
  const vendorToken = vendorTokenFromRequest(req);
  if (vendorToken) {
    try {
      req.user = verifyToken(vendorToken);
      const account = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isActive: true, permission: true } });
      const vendor = account?.isActive ? await vendorForUser(req.user.userId) : null;
      if (account && vendor) {
        req.vendorAccess = { permission: account.permission, vendorId: vendor.id, ownerUserId: vendor.userId };
        return next();
      }
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    } catch { return res.status(401).json({ success: false, error: 'Unauthorized' }); }
  }
  const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization || '');
  if (match) {
    try {
      req.user = verifyToken(match[1]);
      const account = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isActive: true, permission: true } });
      const vendor = account?.isActive ? await vendorForUser(req.user.userId) : null;
      if (account && vendor) {
        req.vendorAccess = { permission: account.permission, vendorId: vendor.id, ownerUserId: vendor.userId };
        return next();
      }
    } catch {}
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
