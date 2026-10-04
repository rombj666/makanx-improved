import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ZodError } from 'zod';
import { clearVendorAuthCookie, setVendorAuthCookie } from '../utils/vendor-auth-cookie';

export const login = async (req: Request, res: Response) => {
  try {
    const result = await authService.login(req.body);
    setVendorAuthCookie(res, result.token);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: { user: result.user } });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    console.warn('Authentication failed');
    res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
};

export const logout = (_req: Request, res: Response) => {
  clearVendorAuthCookie(res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ success: true });
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const user = await authService.getMe(req.user.userId);
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(401).json({ success: false, error: error.message });
  }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const result = await authService.requestPasswordReset(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    console.error('Password reset request failed');
    res.status(400).json({ success: false, error: 'Unable to process password reset request' });
  }
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
  try {
    const result = await authService.confirmPasswordReset(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};
