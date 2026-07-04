"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SetupController_1 = require("../controllers/SetupController");
// Rotas públicas do cadastro do primeiro administrador (pós-instalação).
// Elas se auto-desativam (409) assim que existir um usuário não-protegido.
const router = (0, express_1.Router)();
router.get('/status', SetupController_1.SetupController.status);
router.post('/register', SetupController_1.SetupController.register);
router.post('/verify', SetupController_1.SetupController.verify);
exports.default = router;
