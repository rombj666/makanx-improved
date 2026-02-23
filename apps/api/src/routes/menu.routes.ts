import { Router } from 'express';
import * as menuController from '../controllers/menu.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@makanx/shared';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.getVendorMenu
);

router.post(
  '/',
  requireAuth,
  requireRole([Role.VENDOR]),
  menuController.createMenuItem
);

export default router;