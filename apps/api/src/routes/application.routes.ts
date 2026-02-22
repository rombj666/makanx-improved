import { Router } from 'express';
import * as applicationController from '../controllers/application.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Webhook for Google Forms
router.post('/webhook', applicationController.handleWebhook);

// Public status check
router.post('/status', applicationController.checkApplicationStatus);

// Organizer routes
router.get('/', requireAuth, requireRole([Role.ORGANIZER]), applicationController.getApplications);
router.post('/:id/approve', requireAuth, requireRole([Role.ORGANIZER]), applicationController.approveApplication);
router.post('/:id/reject', requireAuth, requireRole([Role.ORGANIZER]), applicationController.rejectApplication);

export default router;
