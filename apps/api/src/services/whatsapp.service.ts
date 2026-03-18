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

