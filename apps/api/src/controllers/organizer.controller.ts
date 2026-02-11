import { Request, Response } from 'express';
import * as organizerService from '../services/organizer.service';

export const getVendors = async (req: Request, res: Response) => {
  try {
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const result = await organizerService.getVendors(active);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const disableVendor = async (req: Request, res: Response) => {
  try {
    const result = await organizerService.updateVendorStatus(req.params.id, false);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

export const enableVendor = async (req: Request, res: Response) => {
  try {
    const result = await organizerService.updateVendorStatus(req.params.id, true);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};
