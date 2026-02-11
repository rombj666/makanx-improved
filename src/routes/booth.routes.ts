import { Router } from 'express';
import * as boothController from '../controllers/booth.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

router.get('/event/:eventId', boothController.getBoothsByEvent);

// Organizer routes
router.post('/', requireAuth, requireRole([Role.ORGANIZER]), boothController.createBooth);
router.post('/layout', requireAuth, requireRole([Role.ORGANIZER]), boothController.updateLayout);
router.put('/:id', requireAuth, requireRole([Role.ORGANIZER]), boothController.updateBooth);
router.delete('/:id', requireAuth, requireRole([Role.ORGANIZER]), boothController.deleteBooth);

export default router;
