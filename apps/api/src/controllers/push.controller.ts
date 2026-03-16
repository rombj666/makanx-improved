import { Request, Response } from 'express';
import { z } from 'zod';
import { saveSubscription } from '../services/push.service';

const subscribeSchema = z.object({
  customerId: z.string().min(1),
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

export const subscribe = async (req: Request, res: Response) => {
  try {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid subscription payload' });
    }

    const { customerId, subscription } = parsed.data;
    await saveSubscription(customerId, subscription);
    console.log('[push] subscribe ok', { customerId, endpointPrefix: subscription.endpoint.slice(0, 32) });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message ?? 'Unknown error' });
  }
};
