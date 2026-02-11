import { Request, Response } from 'express';
import * as applicationService from '../services/application.service';
import { ZodError } from 'zod';

const WEBHOOK_SECRET = process.env.GOOGLE_WEBHOOK_SECRET || 'secret-token-from-google-script';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    // Basic secret check
    const secret = req.headers['x-webhook-secret'];
    if (secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
    }

    // Adapt Google Form payload if necessary. 
    // For now assuming payload matches schema or is transformed before calling service.
    // Example expectation: { eventId, applicantName, applicantEmail, businessName, ... }
    
    const result = await applicationService.createApplication(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getApplications = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('Unauthorized');
    const result = await applicationService.getApplications(req.user.userId);
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
