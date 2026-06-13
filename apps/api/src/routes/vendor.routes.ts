import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/settings', vendorController.getSettings);
router.patch('/settings', vendorController.updateSettings);
router.get('/order-limit-settings', vendorController.getOrderLimitSettings);
router.patch('/order-limit-settings', vendorController.updateOrderLimitSettings);
router.get('/daily-usage', vendorController.getDailyUsage);
router.post('/recalculate-usage', vendorController.recalculateUsage);
router.post('/sales/reset-today', requireRole([Role.VENDOR]), vendorController.resetTodayOrders);
router.post('/toggle-ordering', vendorController.toggleOrderingStatus);

export default router;
