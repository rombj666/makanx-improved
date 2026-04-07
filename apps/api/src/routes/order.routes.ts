import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Customer
router.post('/', optionalAuth, orderController.createOrder);
router.get('/my-orders', optionalAuth, orderController.getCustomerOrders);

// Vendor
router.get('/vendor-live', requireAuth, requireRole([Role.VENDOR]), orderController.getVendorLiveOrders);
router.get('/vendor-orders', requireAuth, requireRole([Role.VENDOR]), orderController.getVendorOrders);
router.get(
  '/vendor/production-batch',
  requireAuth,
  requireRole([Role.VENDOR]),
  orderController.getVendorProductionBatch
);
router.post(
  '/vendor/production/mark-ready',
  requireAuth,
  requireRole([Role.VENDOR]),
  orderController.markBatchItemsReady
);
router.post(
  '/:id/items/mark-ready',
  requireAuth,
  requireRole([Role.VENDOR]),
  orderController.markOrderItemsReady
);
router.patch('/:id/status', requireAuth, requireRole([Role.VENDOR]), orderController.updateStatus);
router.post('/:id/cancel', optionalAuth, orderController.cancelOrder);
router.put('/bulk-status', requireAuth, requireRole([Role.VENDOR]), orderController.bulkStatusUpdate);

export default router;
