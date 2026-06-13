import { Router } from 'express';
import * as menuController from '../controllers/menu.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/public/:vendorId', menuController.getPublicMenu);

router.post(
  '/',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.createMenuItem
);

router.get(
  '/',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.getVendorMenu
);

router.put(
  '/:id',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.updateMenuItem
);

router.delete(
  '/:id',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.deleteMenuItem
);

export default router;
