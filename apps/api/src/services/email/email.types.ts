export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateData?: Record<string, any>;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  }[];
};

export type SendEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; detail?: any };
