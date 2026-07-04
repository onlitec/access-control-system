"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController_1 = require("../controllers/UserController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const userController = new UserController_1.UserController();
router.use(auth_1.authMiddleware);
// Profiles (all authenticated users)
router.get('/profiles', userController.listProfiles);
router.get('/profiles/:id', userController.getProfile);
// Users (only admins)
router.get('/users', auth_1.adminMiddleware, userController.listUsers);
router.post('/users', auth_1.adminMiddleware, userController.createUser);
router.patch('/users/:id', auth_1.adminMiddleware, userController.updateUser);
router.delete('/users/:id', auth_1.adminMiddleware, userController.deleteUser);
exports.default = router;
