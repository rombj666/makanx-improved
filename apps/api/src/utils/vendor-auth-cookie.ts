import { Request, Response } from 'express';
import { decode, JwtPayload } from 'jsonwebtoken';

export const VENDOR_AUTH_COOKIE = 'smart_qr_vendor_session';

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // A malformed cookie is not an authentication credential.
    }
  }
  return cookies;
}

export function vendorTokenFromCookieHeader(header: string | undefined): string | undefined {
  return parseCookies(header)[VENDOR_AUTH_COOKIE];
}

export function vendorTokenFromRequest(req: Request): string | undefined {
  return vendorTokenFromCookieHeader(req.headers.cookie);
}

export function setVendorAuthCookie(res: Response, token: string): void {
  const payload = decode(token) as JwtPayload | null;
  if (!payload?.exp) throw new Error('Vendor token expiry is required');
  const maxAge = Math.max(0, payload.exp * 1000 - Date.now());
  res.cookie(VENDOR_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearVendorAuthCookie(res: Response): void {
  res.clearCookie(VENDOR_AUTH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
