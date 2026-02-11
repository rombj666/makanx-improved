import { Router } from 'express';
import * as orderController from '../controllers/order.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

// Customer
router.post('/', requireAuth, requireRole([Role.CUSTOMER]), orderController.createOrder);
router.get('/my-orders', requireAuth, requireRole([Role.CUSTOMER]), orderController.getCustomerOrders);

// Vendor
router.get('/vendor-orders', requireAuth, requireRole([Role.VENDOR]), orderController.getVendorOrders);
router.patch('/:id/status', requireAuth, requireRole([Role.VENDOR]), orderController.updateStatus);

export default router;
