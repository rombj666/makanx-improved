import { Request, Response } from 'express';
import * as eventService from '../services/event.service';
import { ZodError } from 'zod';

export const createEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await eventService.createEvent(req.user.userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await eventService.updateEvent(req.params.id, req.user.userId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    await eventService.deleteEvent(req.params.id, req.user.userId);
    res.status(200).json({ success: true, message: 'Event deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getEvents = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'ACTIVE' | 'ARCHIVED' | undefined;
    const result = await eventService.getEvents(status);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const archiveEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await eventService.archiveEvent(req.params.id, req.user.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const unarchiveEvent = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await eventService.unarchiveEvent(req.params.id, req.user.userId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getEventBySlug = async (req: Request, res: Response) => {
  try {
    const result = await eventService.getEventBySlug(req.params.slug);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message });
  }
};
