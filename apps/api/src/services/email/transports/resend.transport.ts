import { Resend } from 'resend';
import { EmailTransport, SendEmailInput, SendEmailResult } from '../email.types';

export class ResendTransport implements EmailTransport {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[ResendTransport] RESEND_API_KEY is not set.');
      // Even if API key is missing, we still create the instance to allow verifyConfig to report it
      this.resend = new Resend('dummy_api_key'); 
    } else {
      this.resend = new Resend(apiKey);
    }

    this.fromEmail = process.env.EMAIL_FROM || 'no-reply@hourcoffee.com.my';
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const { to, subject, html, text } = input;
    const fromName = process.env.EMAIL_FROM_NAME || 'Hour Coffee';
    const from = `${fromName} <${this.fromEmail}>`;

    if (!process.env.RESEND_API_KEY) {
      console.warn('[ResendTransport] Skipping email send: RESEND_API_KEY not set.');
      return { ok: false, error: 'RESEND_API_KEY not set' };
    }

    try {
      console.log('[ResendTransport] Sending email:', { to, subject, from });
      const result = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
        text,
      });

      if (result.error) {
        console.error('[ResendTransport] API error:', result.error);
        return { ok: false, error: 'Resend API error', detail: result.error };
      }

      console.log('[ResendTransport] Email sent successfully, ID:', result.data?.id);
      return { ok: true, messageId: result.data?.id };
    } catch (err: any) {
      console.error('[ResendTransport] Exception during email send:', err);
      return { ok: false, error: 'Exception during send', detail: err?.message || err };
    }
  }

  async verifyConfig(): Promise<{ ok: boolean; message?: string; detail?: any }> {
    if (!process.env.RESEND_API_KEY) {
      return { ok: false, message: 'RESEND_API_KEY is not set in environment variables.' };
    }
    // Resend does not have a direct "verify" endpoint like SMTP.
    // We assume if the API key is present, the config is "valid" enough to attempt sending.
    // A more robust check might involve trying to list domains or send a test email.
    return { ok: true, message: 'RESEND_API_KEY is set. Configuration appears valid.' };
  }
}
