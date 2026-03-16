import { Request, Response } from 'express';
import * as applicationService from '../services/application.service';
import { ZodError } from 'zod';
import prisma from '../utils/prisma';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret-token-from-google-script';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    // Basic secret check
    const secret = req.headers['x-webhook-secret'];
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
    }

    const rawEventName = String(req.body.eventName || '').trim();
    console.log('[applications/webhook] received eventName:', rawEventName);

    if (!rawEventName) {
      return res.status(400).json({ success: false, error: 'Missing eventName' });
    }

    const normalizedEventName = rawEventName.replace(/\s+/g, ' ').trim();
    console.log('[applications/webhook] normalized eventName:', normalizedEventName);

    const event = await prisma.event.findFirst({
      where: {
        name: {
          equals: normalizedEventName,
          mode: 'insensitive',
        },
      },
    });

    if (!event) {
      console.warn('[applications/webhook] event not found for name:', normalizedEventName);
      return res.status(400).json({ success: false, error: 'Invalid event' });
    }

    console.log('[applications/webhook] matched event:', { id: event.id, name: event.name });

    const transformed = {
      eventId: event.id,
      vendorName: req.body.vendorName,
      contactName: req.body.contactName,
      businessEmail: req.body.businessEmail,
      phone: req.body.phone,
      category: req.body.category,
      eventName: event.name,
      description: req.body.description,
      priceMin: req.body.priceMin,
      priceMax: req.body.priceMax,
    };

    const result = await applicationService.createApplication(transformed);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.issues });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getApplications = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await applicationService.getApplications(req.user.userId, { eventId, status });
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const approveApplication = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await applicationService.approveApplication(req.params.id, req.user.userId);
    // In real app, we would email this token to the applicant
    res.status(200).json({ success: true, data: result, message: 'Application approved, invite token generated' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const rejectApplication = async (req: Request, res: Response) => {
    try {
      if (!req.user) throw new Error('Unauthorized');
      const result = await applicationService.rejectApplication(req.params.id, req.user.userId);
      res.status(200).json({ success: true, data: result, message: 'Application rejected' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

export const checkApplicationStatus = async (req: Request, res: Response) => {
    try {
        const { email, phone, eventId } = req.body;
        if (!email || !phone) {
            return res.status(400).json({ success: false, error: 'Email and phone are required' });
        }
        
        const result = await applicationService.checkApplicationStatus(email, phone, eventId);
        
        // If message exists (e.g. not found), we can still return 200 with success: true but null status, 
        // or let the client handle it.
        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
};
