import { Router } from 'express';
import authRoutes from './auth.routes';
import securityRoutes from './security.routes';
import auditRoutes from './audit.routes';
// import adminRoutes from './admin.routes'; // If I extract it later

const router = Router();

router.use('/auth', authRoutes);
router.use('/security', securityRoutes);
router.use('/audit', auditRoutes);

export default router;
