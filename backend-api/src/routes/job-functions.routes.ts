import { Router } from 'express';
import { JobFunctionsController } from '../controllers/JobFunctionsController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();
const controller = new JobFunctionsController();

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/', adminMiddleware, controller.create);
router.patch('/:id', adminMiddleware, controller.update);
router.delete('/:id', adminMiddleware, controller.delete);

export default router;
