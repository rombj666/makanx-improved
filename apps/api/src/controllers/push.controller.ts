import { Request, Response } from 'express';
import { saveSubscription } from '../services/push.service';

export const subscribe = async (req: Request, res: Response) => {
  try {
    const { customerId, subscription } = req.body;
    if (!customerId || !subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, error: 'Invalid subscription payload' });
    }

    await saveSubscription(customerId, subscription);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};

