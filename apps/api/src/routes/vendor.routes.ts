import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/settings', vendorController.getSettings);
router.patch('/settings', vendorController.updateSettings);
router.get('/daily-usage', vendorController.getDailyUsage);
router.post('/toggle-ordering', vendorController.toggleOrderingStatus);

export default router;
