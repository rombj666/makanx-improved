import express from 'express';
import * as emailService from '../services/email/email.service';
import { buildTestEmail } from '../services/email/templates/email.templates';

const router = express.Router();

router.get('/verify', async (_req, res) => {
  try {
    const result = await emailService.verifyEmailConfig();
    if (result.ok) {
      console.log('[email-test-route] Email config verified successfully:', result.message);
      return res.status(200).json({ success: true, message: result.message });
    } else {
      console.error('[email-test-route] Email config verification failed:', result.message, result.detail);
      return res.status(200).json({ success: false, error: result.message, detail: result.detail });
    }
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown_error');
    console.error('[email-test-route] Verify exception:', message);
    return res.status(200).json({ success: false, error: message });
  }
});

router.post('/send', async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!to) {
    return res.status(400).json({ success: false, error: 'missing_to' });
  }

  const { subject, html, text } = buildTestEmail();
  const result = await emailService.sendEmail({ to, subject, html, text });

  if (result.ok) {
    console.log('[email-test-route] Test email sent successfully:', { to, messageId: result.messageId });
    return res.status(200).json({ success: true, messageId: result.messageId });
  } else {
    console.error('[email-test-route] Test email send failed:', { to, error: result.error, detail: result.detail });
    return res.status(200).json({ success: false, error: result.error, detail: result.detail });
  }
});

export default router;
