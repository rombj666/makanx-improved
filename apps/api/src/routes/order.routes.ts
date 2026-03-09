import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Customer
router.post('/', optionalAuth, orderController.createOrder);
router.get('/my-orders', optionalAuth, orderController.getCustomerOrders);

// Vendor
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
router.patch('/:id/status', requireAuth, requireRole([Role.VENDOR]), orderController.updateStatus);
router.put('/bulk-status', requireAuth, requireRole([Role.VENDOR]), orderController.bulkStatusUpdate);

export default router;
