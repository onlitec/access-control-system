"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Apply auth and admin check to all system-users routes
router.use(auth_1.authMiddleware);
router.use(auth_1.adminMiddleware);
// 1. GET /api/system-users - List all users, optional role filter
router.get('/', async (req, res) => {
    try {
        const { role } = req.query;
        const filter = {};
        if (role) {
            filter.role = String(role);
        }
        const users = await database_1.prisma.user.findMany({
            where: filter,
            orderBy: { name: 'asc' },
        });
        // Remove passwords before returning
        const serialized = users.map((u) => {
            const { password, ...rest } = u;
            return rest;
        });
        return res.json(serialized);
    }
    catch (err) {
        console.error('Error listing system users:', err);
        return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});
// 2. POST /api/system-users - Create new system user
router.post('/', async (req, res) => {
    try {
        const { name, email, role, password } = req.body;
        if (!name || !email || !role || !password) {
            return res.status(400).json({ error: 'Nome, e-mail, papel e senha temporária são obrigatórios' });
        }
        const existing = await database_1.prisma.user.findUnique({
            where: { email },
        });
        if (existing) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const newUser = await database_1.prisma.user.create({
            data: {
                name,
                email,
                role,
                password: passwordHash,
                status: 'active',
                mustChangePassword: true,
            },
        });
        const { password: _, ...rest } = newUser;
        return res.status(201).json(rest);
    }
    catch (err) {
        console.error('Error creating system user:', err);
        return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});
// 3. PUT /api/system-users/:id - Update user fields (name, role, status)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, status } = req.body;
        const existing = await database_1.prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const updated = await database_1.prisma.user.update({
            where: { id },
            data: {
                name: name ?? existing.name,
                role: role ?? existing.role,
                status: status ?? existing.status,
            },
        });
        const { password: _, ...rest } = updated;
        return res.json(rest);
    }
    catch (err) {
        console.error('Error updating system user:', err);
        return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});
// 4. DELETE /api/system-users/:id - Soft delete (set status=inactive)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await database_1.prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const updated = await database_1.prisma.user.update({
            where: { id },
            data: { status: 'inactive' },
        });
        const { password: _, ...rest } = updated;
        return res.json(rest);
    }
    catch (err) {
        console.error('Error deleting system user:', err);
        return res.status(500).json({ error: 'Erro ao desativar usuário' });
    }
});
// 5. GET /api/system-users/:id/permissions - Get effective + custom permissions for a user
router.get('/:id/permissions', async (req, res) => {
    try {
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, role: true, customPermissions: true },
        });
        if (!user)
            return res.status(404).json({ error: 'Usuário não encontrado' });
        const rolePerms = await database_1.prisma.rolePermission.findUnique({ where: { role: user.role } });
        const custom = (user.customPermissions ?? {});
        return res.json({
            role: user.role,
            rolePermissions: rolePerms ?? null,
            customPermissions: custom,
            // Effective = role merged with custom overrides
            effectivePermissions: rolePerms ? { ...rolePerms, ...custom } : custom,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// 6. PUT /api/system-users/:id/permissions - Set custom permission overrides for a user
router.put('/:id/permissions', async (req, res) => {
    try {
        const user = await database_1.prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user)
            return res.status(404).json({ error: 'Usuário não encontrado' });
        const allowed = [
            'health', 'containers', 'backups', 'logs', 'integrations',
            'condo', 'users', 'permissions', 'audit',
            'deleteRegistration', 'editRegistration', 'viewOnly', 'editDepartments', 'manageDevices',
        ];
        // Only accept known permission keys; null value removes the override
        const custom = {};
        for (const key of allowed) {
            if (key in req.body) {
                custom[key] = req.body[key] === null ? null : Boolean(req.body[key]);
            }
        }
        // Remove null overrides (revert to role default)
        const cleaned = {};
        for (const [k, v] of Object.entries(custom)) {
            if (v !== null)
                cleaned[k] = v;
        }
        const updated = await database_1.prisma.user.update({
            where: { id: req.params.id },
            data: { customPermissions: Object.keys(cleaned).length > 0 ? cleaned : client_1.Prisma.DbNull },
            select: { id: true, role: true, customPermissions: true },
        });
        return res.json({ success: true, customPermissions: updated.customPermissions });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// 7. POST /api/system-users/:id/reset-password - Generate temporary password
router.post('/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await database_1.prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcryptjs_1.default.hash(tempPassword, 10);
        await database_1.prisma.user.update({
            where: { id },
            data: {
                password: passwordHash,
                mustChangePassword: true,
            },
        });
        return res.json({ tempPassword });
    }
    catch (err) {
        console.error('Error resetting system user password:', err);
        return res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
});
exports.default = router;
