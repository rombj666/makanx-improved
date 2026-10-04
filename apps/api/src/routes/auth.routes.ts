import { randomUUID } from 'crypto';
import { generateGuestToken, verifyGuestToken } from '../utils/jwt';
import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Stricter rate limit for password reset
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 requests per windowMs
  message: { success: false, error: 'Too many password reset attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/guest', (req, res) => {
  let guestId: string;
  if (req.headers.authorization) {
    const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization);
    try {
      if (!match) throw new Error('Invalid credential');
      guestId = verifyGuestToken(match[1]).guestId;
    } catch {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  } else {
    // Never exchange a client-supplied legacy guestId or unsigned device cookie.
    guestId = `guest:${randomUUID()}`;
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true, data: { guestId, guestAccessToken: generateGuestToken(guestId) } });
});

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.getMe);

// Password Reset
router.post('/password/reset/request', resetLimiter, authController.requestPasswordReset);
router.post('/password/reset/confirm', resetLimiter, authController.confirmPasswordReset);

export default router;
