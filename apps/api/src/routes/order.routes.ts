import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

console.log('[order] Registering vendor specific routes');
// Vendor (Move these above all parameterized routes to avoid collision)
router.get('/vendor/:vendorId/serving', optionalAuth, orderController.getVendorServingOrder);
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
router.put('/bulk-status', requireAuth, requireRole([Role.VENDOR]), orderController.bulkStatusUpdate);

console.log('[order] Registering customer specific routes');
// Customer
router.post('/', optionalAuth, orderController.createOrder);
router.get('/my-orders', optionalAuth, orderController.getCustomerOrders);

console.log('[order] Registering order specific actions');
// Order specific actions (keep above generic /:id)
router.post(
  '/:orderId/items/:itemId/mark-ready',
  requireAuth,
  requireRole([Role.VENDOR]),
  orderController.markOrderItemReady
);
router.post(
  '/:id/items/mark-ready',
  requireAuth,
  requireRole([Role.VENDOR]),
  orderController.markOrderItemsReady
);
router.patch('/:id/status', requireAuth, requireRole([Role.VENDOR]), orderController.updateStatus);
router.post('/:id/cancel', optionalAuth, orderController.cancelOrder);

console.log('[order] Registering generic order lookup (must be last)');
// Generic order lookup MUST be last to avoid catching specific string routes
router.get('/:id', optionalAuth, orderController.getOrderById);

export default router;
