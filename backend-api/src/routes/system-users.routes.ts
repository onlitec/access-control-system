import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// Apply auth and admin check to all system-users routes
router.use(authMiddleware);
router.use(adminMiddleware);

// 1. GET /api/system-users - List all users, optional role filter
router.get('/', async (req: Request, res: Response) => {
    try {
        const { role } = req.query;
        const filter: any = {};
        if (role) {
            filter.role = String(role);
        }

        const users = await prisma.user.findMany({
            where: filter,
            orderBy: { name: 'asc' },
        });

        // Remove passwords before returning
        const serialized = users.map((u) => {
            const { password, ...rest } = u;
            return rest;
        });

        return res.json(serialized);
    } catch (err: any) {
        console.error('Error listing system users:', err);
        return res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});

// 2. POST /api/system-users - Create new system user
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, email, role, password } = req.body;
        if (!name || !email || !role || !password) {
            return res.status(400).json({ error: 'Nome, e-mail, papel e senha temporária são obrigatórios' });
        }

        const existing = await prisma.user.findUnique({
            where: { email },
        });
        if (existing) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
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
    } catch (err: any) {
        console.error('Error creating system user:', err);
        return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

// 3. PUT /api/system-users/:id - Update user fields (name, role, status)
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, role, status } = req.body;

        const existing = await prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                name: name ?? existing.name,
                role: role ?? existing.role,
                status: status ?? existing.status,
            },
        });

        const { password: _, ...rest } = updated;
        return res.json(rest);
    } catch (err: any) {
        console.error('Error updating system user:', err);
        return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});

// 4. DELETE /api/system-users/:id - Soft delete (set status=inactive)
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: { status: 'inactive' },
        });

        const { password: _, ...rest } = updated;
        return res.json(rest);
    } catch (err: any) {
        console.error('Error deleting system user:', err);
        return res.status(500).json({ error: 'Erro ao desativar usuário' });
    }
});

// 5. GET /api/system-users/:id/permissions - Get effective + custom permissions for a user
router.get('/:id/permissions', async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, role: true, customPermissions: true },
        });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const rolePerms = await prisma.rolePermission.findUnique({ where: { role: user.role } });
        const custom = (user.customPermissions ?? {}) as Record<string, boolean>;

        return res.json({
            role: user.role,
            rolePermissions: rolePerms ?? null,
            customPermissions: custom,
            // Effective = role merged with custom overrides
            effectivePermissions: rolePerms ? { ...rolePerms, ...custom } : custom,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 6. PUT /api/system-users/:id/permissions - Set custom permission overrides for a user
router.put('/:id/permissions', async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const allowed = [
            'health','containers','backups','logs','integrations',
            'condo','users','permissions','audit',
            'deleteRegistration','editRegistration','viewOnly','editDepartments','manageDevices',
        ];

        // Only accept known permission keys; null value removes the override
        const custom: Record<string, boolean | null> = {};
        for (const key of allowed) {
            if (key in req.body) {
                custom[key] = req.body[key] === null ? null : Boolean(req.body[key]);
            }
        }

        // Remove null overrides (revert to role default)
        const cleaned: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(custom)) {
            if (v !== null) cleaned[k] = v as boolean;
        }

        const updated = await prisma.user.update({
            where: { id: req.params.id },
            data: { customPermissions: Object.keys(cleaned).length > 0 ? (cleaned as Prisma.InputJsonValue) : Prisma.DbNull },
            select: { id: true, role: true, customPermissions: true },
        });

        return res.json({ success: true, customPermissions: updated.customPermissions });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// 7. POST /api/system-users/:id/reset-password - Generate temporary password
router.post('/:id/reset-password', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.user.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        await prisma.user.update({
            where: { id },
            data: {
                password: passwordHash,
                mustChangePassword: true,
            },
        });

        return res.json({ tempPassword });
    } catch (err: any) {
        console.error('Error resetting system user password:', err);
        return res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
});

export default router;
