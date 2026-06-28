import { Router } from 'express';
import { ResidentsController } from '../controllers/ResidentsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const controller = new ResidentsController();

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/sync', controller.sync);

export default router;
