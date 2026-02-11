import { Router } from 'express';
import * as organizerController from '../controllers/organizer.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Apply auth and role middleware to all routes
router.use(requireAuth, requireRole([Role.ORGANIZER]));

router.get('/vendors', organizerController.getVendors);
router.patch('/vendors/:id/disable', organizerController.disableVendor);
router.patch('/vendors/:id/enable', organizerController.enableVendor);

export default router;
