import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import * as analytics from '../controllers/analytics.controller';

const router = Router();
router.use(requireAuth, requireRole([Role.VENDOR]));
router.get('/products', analytics.productPerformance);
router.get('/vendor/summary', analytics.vendorSalesSummary);
router.get('/vendor/products', analytics.vendorProductPerformance);
router.get('/vendor/trend', analytics.vendorRevenueTrend);
router.get('/vendor/product-trend', analytics.vendorProductTrend);
router.get('/vendor/orders', analytics.vendorCompletedOrders);
export default router;
