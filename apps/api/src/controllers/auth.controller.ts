import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ZodError } from 'zod';

export const register = async (req: Request, res: Response) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    res.status(401).json({ success: false, error: error.message });
  }
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
