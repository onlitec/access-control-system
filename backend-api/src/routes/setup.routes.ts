import { Router } from 'express';
import { SetupController } from '../controllers/SetupController';

// Rotas públicas do cadastro do primeiro administrador (pós-instalação).
// Elas se auto-desativam (409) assim que existir um usuário não-protegido.
const router = Router();

router.get('/status', SetupController.status);
router.post('/register', SetupController.register);
router.post('/verify', SetupController.verify);

export default router;
