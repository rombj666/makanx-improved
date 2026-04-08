import { getHourCoffeeEmailTransporter, buildEmailFrom } from './smtp.config';
import { SendEmailInput, SendEmailResult } from './email.types';
import { buildTestEmail, buildOrderReadyEmail, buildPasswordResetEmail } from './templates/hour-coffee.templates';

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, html, text } = input;
  const transporter = getHourCoffeeEmailTransporter();
  const from = buildEmailFrom();

  try {
    console.log('[EmailService] Sending email:', { to, subject, from });
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log('[EmailService] Email sent successfully, ID:', info?.messageId);
    return { ok: true, messageId: info?.messageId };
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown_error');
    console.error('[EmailService] Send failed:', { to, subject, message });
    return { ok: false, error: message, detail: err };
  }
}

export async function verifyEmailConfig(): Promise<{ ok: boolean; message?: string; detail?: any }> {
  const transporter = getHourCoffeeEmailTransporter();
  try {
    console.log('[EmailService] Verifying SMTP configuration...');
    await transporter.verify();
    console.log('[EmailService] SMTP configuration verified successfully.');
    return { ok: true, message: 'SMTP configuration verified successfully.' };
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown_error');
    const code = String(err?.code || 'no_code');
    const command = String(err?.command || 'no_command');
    console.error('[EmailService] SMTP verification failed:', { message, code, command });
    return { ok: false, message: 'SMTP configuration verification failed.', detail: { code, command, message } };
  }
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
