import nodemailer, { type Transporter } from 'nodemailer';

type SendHourCoffeeEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

type HourCoffeeEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

let cachedTransporter: Transporter | null = null;

function parsePort(val: unknown) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function parseBool(val: unknown) {
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function buildFrom() {
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@hourcoffee.local';
  const fromName = process.env.EMAIL_FROM_NAME || 'Hour Coffee';
  return `${fromName} <${fromAddress}>`;
}

export function getHourCoffeeEmailTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseBool(process.env.SMTP_SECURE);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return cachedTransporter;
}

export async function sendHourCoffeeEmail(input: SendHourCoffeeEmailInput): Promise<HourCoffeeEmailResult> {
  const to = String(input.to || '').trim();
  const subject = String(input.subject || '').trim();
  const html = typeof input.html === 'string' ? input.html : undefined;
  const text = typeof input.text === 'string' ? input.text : undefined;

  if (!to) return { ok: false, error: 'missing_to' };
  if (!subject) return { ok: false, error: 'missing_subject' };

  const transporter = getHourCoffeeEmailTransporter();
  const from = buildFrom();

  try {
    console.log('[hour-coffee-email] sending', { to, subject, from });
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log('[hour-coffee-email] sent', { to, subject, messageId: info?.messageId });
    return { ok: true, messageId: info?.messageId };
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown_error');
    console.error('[hour-coffee-email] send failed', { to, subject, message });
    return { ok: false, error: message };
  }
}

export async function sendHourCoffeeTestEmail(to: string): Promise<HourCoffeeEmailResult> {
  const subject = 'Hour Coffee SMTP Test';
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">Hour Coffee Email Test</h1>
      <p style="margin: 0; font-size: 14px; line-height: 1.6;">
        If you received this email, the Hour Coffee SMTP setup is working correctly.
      </p>
    </div>
  `.trim();
  const text =
    'Hour Coffee Email Test. If you received this email, the Hour Coffee SMTP setup is working correctly.';

  return sendHourCoffeeEmail({ to, subject, html, text });
}

