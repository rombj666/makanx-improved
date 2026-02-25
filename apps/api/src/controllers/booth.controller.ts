import { Request, Response } from 'express';
import * as boothService from '../services/booth.service';
import { ZodError } from 'zod';

export const createBooth = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await boothService.createBooth(req.user.userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateBooth = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await boothService.updateBooth(req.params.id, req.user.userId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const deleteBooth = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    await boothService.deleteBooth(req.params.id, req.user.userId);
    res.status(200).json({ success: true, message: 'Booth deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getBoothsByEvent = async (req: Request, res: Response) => {
  try {
    const result = await boothService.getBoothsByEvent(req.params.eventId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateLayout = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await boothService.updateEventLayout(req.user.userId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};
