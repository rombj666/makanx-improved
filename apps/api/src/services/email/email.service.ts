import { Resend } from 'resend';
import { SendEmailInput, SendEmailResult } from './email.types';
import { buildTestEmail, buildOrderReadyEmail, buildPasswordResetEmail } from './templates/hour-coffee.templates';

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmailFrom(): string {
  const fromAddress = process.env.EMAIL_FROM || 'no-reply@hourcoffee.com.my';
  const fromName = process.env.EMAIL_FROM_NAME || 'Hour Coffee';
  return `${fromName} <${fromAddress}>`;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, html, text } = input;
  const from = buildEmailFrom();

  if (!process.env.RESEND_API_KEY) {
    console.warn('[EmailService] Skipping email send: RESEND_API_KEY not set.');
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }

  try {
    console.log(`[EmailService] Attempting to send email to ${to} with subject: "${subject}"...`);
    
    const emailPayload: {
      from: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
    } = {
      from,
      to,
      subject,
    };

    if (html !== undefined && html !== null) {
      emailPayload.html = html;
    }
    if (text !== undefined && text !== null) {
      emailPayload.text = text;
    }

    const result = await resend.emails.send(emailPayload as any);

    if (result.error) {
      console.error(`[EmailService] Resend API error for ${to}:`, result.error);
      return { ok: false, error: 'Resend API error', detail: result.error };
    }

    console.log(`[EmailService] Email sent successfully to ${to}, Message ID: ${result.data?.id}`);
    return { ok: true, messageId: result.data?.id };
  } catch (err: any) {
    console.error(`[EmailService] Exception while sending email to ${to}:`, err?.message || err);
    return { ok: false, error: 'Exception during send', detail: err?.message || err };
  }
}

export async function verifyEmailConfig(): Promise<{ ok: boolean; message?: string; detail?: any }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, message: 'RESEND_API_KEY is not set in environment variables.' };
  }
  // Resend does not have a direct "verify" endpoint like SMTP.
  // We assume if the API key is present, the config is "valid" enough to attempt sending.
  return { ok: true, message: 'RESEND_API_KEY is set. Configuration appears valid.' };
}

export async function sendHourCoffeeTestEmail(to: string): Promise<SendEmailResult> {
  const { subject, html, text } = buildTestEmail();
  return sendEmail({ to, subject, html, text });
}

export async function sendHourCoffeeReadyEmail(
  to: string,
  orderNumber: string,
  boothName: string,
  orderId: string
): Promise<SendEmailResult> {
  const customerOrderPageUrl = process.env.CLIENT_URL
    ? `${process.env.CLIENT_URL}/customer/order-confirmed?orderId=${orderId}`
    : undefined;

  const { subject, html, text } = buildOrderReadyEmail({
    orderNumber,
    boothName,
    customerOrderPageUrl,
  });

  return sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail(to: string, otp: string): Promise<SendEmailResult> {
  const { subject, html, text } = buildPasswordResetEmail({ otp });
  return sendEmail({ to, subject, html, text });
}
