import { Router } from 'express';
import { ServiceProvidersController } from '../controllers/ServiceProvidersController';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const controller = new ServiceProvidersController();

router.use(authMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
