import { Request, Response } from 'express';
import * as inviteService from '../services/invite.service';
import { ZodError } from 'zod';

export const verifyInvite = async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) throw new Error('Token required');
    const result = await inviteService.verifyInvite(token);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const result = await inviteService.acceptInvite(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};
