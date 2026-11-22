import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { requireAuth, requireAdmin } from '../middleware/auth';
import * as eventController from '../controllers/event.controller';

const router = Router();

router.use(requireAuth);

router.get('/events/current', eventController.getCurrent);
router.get('/events', eventController.listHistory);
router.post('/events', requireAdmin, eventController.create);
router.patch('/events/:id', requireAdmin, eventController.update);
router.post('/events/:id/complete', requireAdmin, eventController.complete);
router.patch('/events/:id/ordering', requireAdmin, eventController.updateOrdering);
router.post('/events/:id/archive', requireAdmin, eventController.archive);
router.get('/events/:id/orders', eventController.orders);
router.get('/events/:id/export.xlsx', eventController.exportExcel);

router.get('/settings', requireAdmin, vendorController.getSettings);
router.patch('/settings', requireAdmin, vendorController.updateSettings);
router.get('/order-limit-settings', requireAdmin, vendorController.getOrderLimitSettings);
router.patch('/order-limit-settings', requireAdmin, vendorController.updateOrderLimitSettings);
router.get('/batch-settings', requireAdmin, vendorController.getBatchSettings);
router.patch('/batch-settings', requireAdmin, vendorController.updateBatchSettings);
router.get('/daily-usage', vendorController.getDailyUsage);
router.get('/sales-config', vendorController.getSalesReadOnlyConfig);
router.post('/recalculate-usage', requireAdmin, vendorController.recalculateUsage);
export default router;
