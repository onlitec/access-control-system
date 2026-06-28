import { Router } from 'express';
import { AuditController } from '../controllers/AuditController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

router.get('/sessions', authMiddleware, adminMiddleware, AuditController.getSessions);
router.get('/export/meta', authMiddleware, adminMiddleware, AuditController.getExportMeta);

export default router;
