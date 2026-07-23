import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller';
import { requireAuth } from '../middleware/auth';
import * as eventController from '../controllers/event.controller';

const router = Router();

router.use(requireAuth);

router.get('/events/current', eventController.getCurrent);
router.get('/events', eventController.listHistory);
router.post('/events', eventController.create);
router.patch('/events/:id', eventController.update);
router.post('/events/:id/complete', eventController.complete);
router.patch('/events/:id/ordering', eventController.updateOrdering);
router.post('/events/:id/archive', eventController.archive);
router.get('/events/:id/orders', eventController.orders);
router.get('/events/:id/export.xlsx', eventController.exportExcel);

router.get('/settings', vendorController.getSettings);
router.patch('/settings', vendorController.updateSettings);
router.get('/order-limit-settings', vendorController.getOrderLimitSettings);
router.patch('/order-limit-settings', vendorController.updateOrderLimitSettings);
router.get('/daily-usage', vendorController.getDailyUsage);
router.post('/recalculate-usage', vendorController.recalculateUsage);
export default router;
