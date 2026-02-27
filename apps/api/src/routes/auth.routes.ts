import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as inviteController from '../controllers/invite.controller';
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

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.getMe);
router.post('/customer/qr', authController.customerQrLogin);

// Password Reset
router.post('/password/reset/request', resetLimiter, authController.requestPasswordReset);
router.post('/password/reset/confirm', resetLimiter, authController.confirmPasswordReset);

// Invite routes
router.get('/invite/verify', inviteController.verifyInvite);
router.post('/invite/accept', inviteController.acceptInvite);

export default router;
