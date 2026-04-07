export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  // Optional: for templates that need dynamic data
  templateData?: Record<string, any>;
};

export type SendEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; detail?: any };

export interface EmailTransport {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  verifyConfig(): Promise<{ ok: boolean; message?: string; detail?: any }>;
}
