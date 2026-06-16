import { Router } from 'express';
import * as publicController from '../controllers/public.controller';

const router = Router();

router.get('/vendors/:slug', publicController.getVendor);
router.get('/vendors/:slug/menu', publicController.getVendorMenu);
router.post('/vendors/:slug/orders', publicController.createVendorOrder);

export default router;
