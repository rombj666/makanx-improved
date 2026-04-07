import { EmailTransport } from './email.types';
import { ResendTransport } from './transports/resend.transport';
import { SmtpTransport } from './transports/smtp.transport';

const EMAIL_PROVIDER_RESEND = 'resend';
const EMAIL_PROVIDER_SMTP = 'smtp';

let activeTransport: EmailTransport | null = null;

export function getEmailProvider(): EmailTransport {
  if (activeTransport) {
    return activeTransport;
  }

  const providerType = (process.env.EMAIL_PROVIDER || EMAIL_PROVIDER_RESEND).toLowerCase();

  console.log('[EmailProvider] Initializing email provider:', providerType);

  switch (providerType) {
    case EMAIL_PROVIDER_RESEND:
      activeTransport = new ResendTransport();
      break;
    case EMAIL_PROVIDER_SMTP:
      activeTransport = new SmtpTransport();
      break;
    default:
      console.warn(`[EmailProvider] Unknown email provider "${providerType}". Defaulting to Resend.`);
      activeTransport = new ResendTransport();
      break;
  }

  return activeTransport;
}
