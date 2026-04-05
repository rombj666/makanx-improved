import express from 'express';
import { getHourCoffeeEmailTransporter, sendHourCoffeeTestEmail } from '../services/hour-coffee-email.service';

const router = express.Router();

router.get('/verify', async (_req, res) => {
  try {
    const transporter = getHourCoffeeEmailTransporter();
    try {
      console.log('[hour-coffee-test-email] starting SMTP verify...');
      await transporter.verify();
      console.log('[hour-coffee-test-email] SMTP verify ok');
      return res.status(200).json({ success: true });
    } catch (err: any) {
      const message = String(err?.message || err || 'unknown_error');
      const code = String(err?.code || 'no_code');
      const command = String(err?.command || 'no_command');
      
      console.error('[hour-coffee-test-email] SMTP verify failed', { message, code, command });
      
      return res.status(200).json({ 
        success: false, 
        error: message,
        details: { code, command }
      });
    }
  } catch (err: any) {
    const message = String(err?.message || err || 'unknown_error');
    console.error('[hour-coffee-test-email] verify exception', { message });
    return res.status(200).json({ success: false, error: message });
  }
});

router.post('/send', async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!to) {
    return res.status(400).json({ success: false, error: 'missing_to' });
  }

  const result = await sendHourCoffeeTestEmail(to);
  if (result.ok) {
    console.log('[hour-coffee-test-email] send ok', { to, messageId: result.messageId });
    return res.status(200).json({ success: true, messageId: result.messageId });
  }

  console.error('[hour-coffee-test-email] send failed', { to, error: result.error });
  return res.status(200).json({ success: false, error: result.error });
});

export default router;

