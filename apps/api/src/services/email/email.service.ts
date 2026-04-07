import { getEmailProvider } from './email.provider';
import { SendEmailInput, SendEmailResult } from './email.types';

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  return provider.sendEmail(input);
}

export async function verifyEmailConfig(): Promise<{ ok: boolean; message?: string; detail?: any }> {
  const provider = getEmailProvider();
  return provider.verifyConfig();
}
