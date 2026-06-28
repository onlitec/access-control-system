import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.get('/me', authMiddleware, AuthController.me);
router.post('/logout', AuthController.logout);
router.post('/sessions/revoke', authMiddleware, AuthController.revokeSession);

// Onboarding
router.post('/first-access/validate', AuthController.firstAccessValidate);
router.post('/first-access/setup-password', AuthController.firstAccessSetupPassword);
router.post('/logout', AuthController.logout);

export default router;
