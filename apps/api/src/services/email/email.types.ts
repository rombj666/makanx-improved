export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateData?: Record<string, any>;
};

export type SendEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; detail?: any };
