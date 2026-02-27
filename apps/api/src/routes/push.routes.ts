import { Router } from 'express';
import * as pushController from '../controllers/push.controller';

const router = Router();

router.post('/subscribe', pushController.subscribe);

export default router;

