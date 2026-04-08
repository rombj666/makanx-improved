import nodemailer, { Transporter } from 'nodemailer';

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

export function getHourCoffeeEmailTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parsePort(process.env.SMTP_PORT);
  const secure = parseBool(process.env.SMTP_SECURE);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  console.log('[SMTP] Initializing transporter', {
    host,
    port,
    secure,
    hasUser: !!user,
    hasPass: !!pass,
  });

  if (!host) {
    console.warn('[SMTP] SMTP_HOST missing from env');
  }

  // Common port/secure checks
  if (port === 465 && !secure) {
    console.warn('[SMTP] Warning: port 465 usually requires SMTP_SECURE=true');
  }
  if (port === 587 && secure) {
    console.warn('[SMTP] Warning: port 587 usually requires SMTP_SECURE=false (STARTTLS)');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10000, // 10s
    greetingTimeout: 10000,   // 10s
    socketTimeout: 10000,     // 10s
  });

  return cachedTransporter;
}

export function buildEmailFrom(): string {
  const fromAddress = process.env.EMAIL_FROM || 'no-reply@hourcoffee.com.my';
  const fromName = process.env.EMAIL_FROM_NAME || 'Hour Coffee';
  return `${fromName} <${fromAddress}>`;
}
