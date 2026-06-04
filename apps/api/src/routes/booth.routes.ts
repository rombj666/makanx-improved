import { Router } from 'express';
import * as boothController from '../controllers/booth.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/event/:eventId', boothController.getBoothsByEvent);

// Organizer routes
router.post('/', requireAuth, requireRole([Role.ORGANIZER]), boothController.createBooth);
router.post('/layout', requireAuth, requireRole([Role.ORGANIZER]), boothController.updateLayout);
router.put('/:id', requireAuth, requireRole([Role.ORGANIZER]), boothController.updateBooth);
router.delete('/:id', requireAuth, requireRole([Role.ORGANIZER]), boothController.deleteBooth);

// Vendor routes
router.get('/vendor/show-prices', requireAuth, requireRole([Role.VENDOR]), boothController.getVendorShowPrices);
router.patch('/vendor/show-prices', requireAuth, requireRole([Role.VENDOR]), boothController.vendorUpdateShowPrices);

export default router;
