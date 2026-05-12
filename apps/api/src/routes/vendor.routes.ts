import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/settings', vendorController.getSettings);
router.patch('/settings', vendorController.updateSettings);
router.get('/daily-usage', vendorController.getDailyUsage);
router.post('/recalculate-usage', vendorController.recalculateUsage);
router.post('/toggle-ordering', vendorController.toggleOrderingStatus);

export default router;
