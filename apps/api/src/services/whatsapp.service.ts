export type WhatsAppWebhookSummary = {
  object: string | null;
  eventTypes: ('messages' | 'statuses' | 'unknown')[];
  hasMessages: boolean;
  hasStatuses: boolean;
  phoneNumberId: string | null;
  messageCount: number;
  statusCount: number;
  messageIds: string[];
  messageFrom: string[];
  messageTypes: string[];
  statusIds: string[];
  statusValues: string[];
  statusRecipients: string[];
};

function isRecord(val: unknown): val is Record<string, unknown> {
  return !!val && typeof val === 'object' && !Array.isArray(val);
}

function asString(val: unknown): string | null {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return null;
}

function asArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

export function maskPhone(input: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.length <= 4) return '****';
  const last4 = digits.slice(-4);
  return `****${last4}`;
}

export function summarizeWhatsAppWebhook(payload: unknown): WhatsAppWebhookSummary {
  const root = isRecord(payload) ? payload : {};
  const object = asString(root.object);

  const entry = asArray(root.entry);
  let phoneNumberId: string | null = null;

  const messageIds: string[] = [];
  const messageFrom: string[] = [];
  const messageTypes: string[] = [];
  const statusIds: string[] = [];
  const statusValues: string[] = [];
  const statusRecipients: string[] = [];

  let hasMessages = false;
  let hasStatuses = false;
  const eventTypesSet = new Set<'messages' | 'statuses' | 'unknown'>();

  for (const e of entry) {
    const entryRec = isRecord(e) ? e : null;
    const changes = asArray(entryRec?.changes);
    for (const c of changes) {
      const changeRec = isRecord(c) ? c : null;
      const value = isRecord(changeRec?.value) ? (changeRec!.value as Record<string, unknown>) : null;
      if (!value) {
        eventTypesSet.add('unknown');
        continue;
      }

      const metadata = isRecord(value.metadata) ? (value.metadata as Record<string, unknown>) : null;
      const pnid = asString(metadata?.phone_number_id);
      if (!phoneNumberId && pnid) phoneNumberId = pnid;

      const messages = asArray(value.messages);
      if (messages.length > 0) {
        hasMessages = true;
        eventTypesSet.add('messages');
        for (const m of messages) {
          const msg = isRecord(m) ? m : null;
          const id = asString(msg?.id);
          const from = asString(msg?.from);
          const type = asString(msg?.type);
          if (id) messageIds.push(id);
          if (from) messageFrom.push(from);
          if (type) messageTypes.push(type);
        }
      }

      const statuses = asArray(value.statuses);
      if (statuses.length > 0) {
        hasStatuses = true;
        eventTypesSet.add('statuses');
        for (const s of statuses) {
          const st = isRecord(s) ? s : null;
          const id = asString(st?.id);
          const status = asString(st?.status);
          const recipient = asString(st?.recipient_id);
          if (id) statusIds.push(id);
          if (status) statusValues.push(status);
          if (recipient) statusRecipients.push(recipient);
        }
      }
    }
  }

  if (!hasMessages && !hasStatuses) eventTypesSet.add('unknown');

  return {
    object,
    eventTypes: Array.from(eventTypesSet),
    hasMessages,
    hasStatuses,
    phoneNumberId,
    messageCount: messageIds.length,
    statusCount: statusIds.length,
    messageIds: uniq(messageIds).slice(0, 10),
    messageFrom: uniq(messageFrom).slice(0, 10),
    messageTypes: uniq(messageTypes).slice(0, 10),
    statusIds: uniq(statusIds).slice(0, 10),
    statusValues: uniq(statusValues).slice(0, 10),
    statusRecipients: uniq(statusRecipients).slice(0, 10),
  };
}

type WhatsAppSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; status: number | null; error: string };

function normalizeWhatsAppPhone(input: unknown): string | null {
  const raw = asString(input);
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function computeOrderNumber(order: any): string {
  const raw =
    order?.boothOrderNumber ??
    order?.displayNumber ??
    order?.orderNumber ??
    order?.sequence ??
    null;
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== '') {
    return String(raw).toUpperCase();
  }
  const id = String(order?.id || '');
  return id ? id.slice(-4).toUpperCase() : '----';
}

function getVendorName(order: any): string {
  const name = order?.vendor?.businessName ?? order?.vendorName ?? null;
  return typeof name === 'string' && name.trim() ? name.trim() : 'MakanX';
}

function extractCustomerPhone(order: any): string | null {
  const direct =
    order?.customerPhone ?? order?.customer?.phoneNumber ?? order?.customer?.phone ?? order?.phone ?? null;
  const normalizedDirect = normalizeWhatsAppPhone(direct);
  if (normalizedDirect) return normalizedDirect;
  return null;
}

export async function sendTemplateMessage(params: {
  to: string;
  templateName: string;
  bodyParams: string[];
  languageCode?: string;
}): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const languageCode = params.languageCode || 'en';

  if (!accessToken || !phoneNumberId) {
    return { ok: false, status: null, error: 'WhatsApp env missing (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID)' };
  }

  const url = `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = raw;
      try {
        const parsed = JSON.parse(raw);
        msg = JSON.stringify(parsed?.error || parsed);
      } catch {}
      return { ok: false, status: res.status, error: msg || `HTTP ${res.status}` };
    }

    let messageId: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      const mid = parsed?.messages?.[0]?.id;
      if (typeof mid === 'string') messageId = mid;
    } catch {}

    return { ok: true, messageId };
  } catch (e: any) {
    return { ok: false, status: null, error: e?.message || 'WhatsApp request failed' };
  }
}

export async function sendOrderReadyMessage(order: any): Promise<void> {
  const templateName = process.env.WHATSAPP_TEMPLATE_ORDER_READY || 'order_ready_notice';
  const to = extractCustomerPhone(order);
  if (!to) {
    console.warn('[whatsapp] skip send (missing/invalid phone)', { orderId: String(order?.id || '') });
    return;
  }

  const orderNumber = computeOrderNumber(order);
  const vendorName = getVendorName(order);

  const result = await sendTemplateMessage({
    to,
    templateName,
    bodyParams: [orderNumber, vendorName],
    languageCode: 'en',
  });

  if (!result.ok) {
    console.error('[whatsapp] send failed', {
      orderId: String(order?.id || ''),
      orderNumber,
      to: maskPhone(to),
      templateName,
      status: result.status,
      error: result.error,
    });
    return;
  }

  console.log('[whatsapp] sent', {
    orderId: String(order?.id || ''),
    orderNumber,
    to: maskPhone(to),
    templateName,
    messageId: result.messageId,
  });
}
