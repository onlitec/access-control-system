import { Router } from 'express';
import { SecurityController } from '../controllers/SecurityController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

router.get('/metrics', authMiddleware, adminMiddleware, SecurityController.getMetrics);
router.get('/metrics/history', authMiddleware, adminMiddleware, SecurityController.getMetricsHistory);
router.post('/metrics/snapshots', authMiddleware, adminMiddleware, SecurityController.createSnapshot);

export default router;
