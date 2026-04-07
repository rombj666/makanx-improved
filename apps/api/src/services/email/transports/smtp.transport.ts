import nodemailer, { Transporter } from 'nodemailer';
import { EmailTransport, SendEmailInput, SendEmailResult } from '../email.types';

function parsePort(val: unknown) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function parseBool(val: unknown) {
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

export class SmtpTransport implements EmailTransport {
  private transporter: Transporter | null = null;
  private fromEmail: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'no-reply@hourcoffee.com.my';
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = String(process.env.SMTP_HOST || '').trim();
    const port = parsePort(process.env.SMTP_PORT);
    const secure = parseBool(process.env.SMTP_SECURE);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();

    console.log('[SmtpTransport] Initializing transporter', {
      host,
      port,
      secure,
      hasUser: !!user,
      hasPass: !!pass,
    });

    if (!host) {
      console.warn('[SmtpTransport] Transporter init: SMTP_HOST missing from env');
    }

    // Common port/secure checks
    if (port === 465 && !secure) {
      console.warn('[SmtpTransport] Warning: port 465 usually requires SMTP_SECURE=true');
    }
    if (port === 587 && secure) {
      console.warn('[SmtpTransport] Warning: port 587 usually requires SMTP_SECURE=false (STARTTLS)');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10000, // 10s
      greetingTimeout: 10000,   // 10s
      socketTimeout: 10000,     // 10s
    });

    return this.transporter;
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const { to, subject, html, text } = input;
    const fromName = process.env.EMAIL_FROM_NAME || 'Hour Coffee';
    const from = `${fromName} <${this.fromEmail}>`;

    const transporter = this.getTransporter();

    if (!process.env.SMTP_HOST) {
      console.warn('[SmtpTransport] Skipping email send: SMTP_HOST not set.');
      return { ok: false, error: 'SMTP_HOST not set' };
    }

    try {
      console.log('[SmtpTransport] Sending email:', { to, subject, from });
      const info = await transporter.sendMail({ from, to, subject, html, text });
      console.log('[SmtpTransport] Email sent successfully, ID:', info?.messageId);
      return { ok: true, messageId: info?.messageId };
    } catch (err: any) {
      console.error('[SmtpTransport] Exception during email send:', err);
      return { ok: false, error: 'Exception during send', detail: err?.message || err };
    }
  }

  async verifyConfig(): Promise<{ ok: boolean; message?: string; detail?: any }> {
    const host = String(process.env.SMTP_HOST || '').trim();
    if (!host) {
      return { ok: false, message: 'SMTP_HOST is not set in environment variables.' };
    }

    const transporter = this.getTransporter();
    try {
      console.log('[SmtpTransport] Verifying SMTP configuration...');
      await transporter.verify();
      console.log('[SmtpTransport] SMTP configuration verified successfully.');
      return { ok: true, message: 'SMTP configuration verified successfully.' };
    } catch (err: any) {
      const message = String(err?.message || err || 'unknown_error');
      const code = String(err?.code || 'no_code');
      const command = String(err?.command || 'no_command');
      console.error('[SmtpTransport] SMTP verification failed:', { message, code, command });
      return { ok: false, message: 'SMTP configuration verification failed.', detail: { code, command, message } };
    }
  }
}
