import { Request, Response } from 'express';
import { ZodError } from 'zod';
import * as eventService from '../services/event.service';

function message(error: any) {
  if (error instanceof ZodError) return error.issues.map((issue) => issue.message).join(', ');
  return error?.message || 'Unable to manage event.';
}

function statusFor(error: any) {
  return message(error) === eventService.ACTIVE_EVENT_CONFLICT_MESSAGE ? 409 : 400;
}

export const getCurrent = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await eventService.getCurrentEvent(req.user!.userId) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const listHistory = async (req: Request, res: Response) => {
  try {
    const includeArchived = String(req.query.includeArchived || '') === 'true';
    res.json({ success: true, data: await eventService.listEventHistory(req.user!.userId, includeArchived) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const data = await eventService.createAndActivateEvent(req.user!.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await eventService.updateEvent(req.user!.userId, req.params.id, req.body) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const complete = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await eventService.completeEvent(req.user!.userId, req.params.id) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const updateOrdering = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await eventService.updateOrderingStatus(req.user!.userId, req.params.id, req.body),
    });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const archive = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await eventService.archiveEvent(req.user!.userId, req.params.id) });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const orders = async (req: Request, res: Response) => {
  try {
    const data = await eventService.getEventOrders(req.user!.userId, req.params.id, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};

export const exportExcel = async (req: Request, res: Response) => {
  try {
    const buffer = await eventService.exportEventExcel(req.user!.userId, req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}-orders.xlsx"`);
    res.send(buffer);
  } catch (error: any) {
    res.status(statusFor(error)).json({ success: false, error: message(error) });
  }
};
