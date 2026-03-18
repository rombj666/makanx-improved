import { Request, Response } from 'express';
import { maskPhone, summarizeWhatsAppWebhook } from '../services/whatsapp.service';

export function verifyWebhook(req: Request, res: Response) {
  const mode = String((req.query as any)?.['hub.mode'] ?? '');
  const token = String((req.query as any)?.['hub.verify_token'] ?? '');
  const challenge = (req.query as any)?.['hub.challenge'];

  const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && expected && token === expected) {
    return res.status(200).send(String(challenge ?? ''));
  }

  return res.sendStatus(403);
}

export function receiveWebhook(req: Request, res: Response) {
  const summary = summarizeWhatsAppWebhook(req.body);

  const safe = {
    object: summary.object,
    eventTypes: summary.eventTypes,
    phoneNumberId: summary.phoneNumberId,
    hasMessages: summary.hasMessages,
    hasStatuses: summary.hasStatuses,
    messageCount: summary.messageCount,
    statusCount: summary.statusCount,
    messageFrom: summary.messageFrom.map(maskPhone),
    statusRecipients: summary.statusRecipients.map(maskPhone),
    messageIds: summary.messageIds,
    statusIds: summary.statusIds,
    statusValues: summary.statusValues,
    messageTypes: summary.messageTypes,
  };

  console.log('[whatsapp/webhook] received', safe);
  return res.sendStatus(200);
}

