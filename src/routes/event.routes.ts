import { Router } from 'express';
import * as eventController from '../controllers/event.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Public routes
router.get('/', eventController.getEvents);
router.get('/:slug', eventController.getEventBySlug);

// Organizer routes
router.post('/', requireAuth, requireRole([Role.ORGANIZER]), eventController.createEvent);
router.put('/:id', requireAuth, requireRole([Role.ORGANIZER]), eventController.updateEvent);
router.delete('/:id', requireAuth, requireRole([Role.ORGANIZER]), eventController.deleteEvent);

export default router;
