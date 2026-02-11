import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as inviteController from '../controllers/invite.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.getMe);

// Invite routes
router.get('/invite/verify', inviteController.verifyInvite);
router.post('/invite/accept', inviteController.acceptInvite);

export default router;
