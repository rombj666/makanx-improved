import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';
import * as analyticsController from '../controllers/analytics.controller';

const router = Router();

router.get(
  '/organizer/summary',
  requireAuth,
  requireRole([Role.ORGANIZER]),
  analyticsController.organizerDailySummary
);

router.get(
  '/organizer/vendors',
  requireAuth,
  requireRole([Role.ORGANIZER]),
  analyticsController.organizerVendorRevenue
);

router.get(
  '/organizer/products',
  requireAuth,
  requireRole([Role.ORGANIZER]),
  analyticsController.organizerProductPerformance
);

router.get(
  '/organizer/trend',
  requireAuth,
  requireRole([Role.ORGANIZER]),
  analyticsController.organizerRevenueTrend
);

router.get(
  '/vendor/summary',
  requireAuth,
  requireRole([Role.VENDOR]),
  analyticsController.vendorSalesSummary
);

router.get(
  '/vendor/products',
  requireAuth,
  requireRole([Role.VENDOR]),
  analyticsController.vendorProductPerformance
);

router.get(
  '/vendor/trend',
  requireAuth,
  requireRole([Role.VENDOR]),
  analyticsController.vendorRevenueTrend
);

router.get(
  '/vendor/orders',
  requireAuth,
  requireRole([Role.VENDOR]),
  analyticsController.vendorCompletedOrders
);

export default router;
