import { Router } from 'express';
import { StaffController } from '../controllers/StaffController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const controller = new StaffController();

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);

export default router;
