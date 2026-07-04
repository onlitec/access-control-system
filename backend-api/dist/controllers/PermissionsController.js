"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
class PermissionsController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        // Listar todas as permissões disponíveis no sistema
        this.listPermissions = async (req, res) => {
            try {
                const permissions = await db_1.prisma.permission.findMany({
                    orderBy: { code: 'asc' }
                });
                return res.json(permissions);
            }
            catch (error) {
                console.error('Error listing permissions:', error);
                return this.error(res, 'Erro ao listar permissões');
            }
        };
        // Listar permissões de um usuário específico
        this.listUserPermissions = async (req, res) => {
            const { userId } = req.params;
            try {
                const userPermissions = await db_1.prisma.userPermission.findMany({
                    where: { userId },
                    include: { permission: true }
                });
                return res.json(userPermissions.map((up) => up.permission));
            }
            catch (error) {
                console.error('Error listing user permissions:', error);
                return this.error(res, 'Erro ao listar permissões do usuário');
            }
        };
        // Atribuir uma permissão a um usuário
        this.assignPermission = async (req, res) => {
            const { userId, permissionId } = req.body;
            try {
                if (!userId || !permissionId) {
                    return this.badRequest(res, 'ID do usuário e ID da permissão são obrigatórios');
                }
                const targetUser = await db_1.prisma.user.findUnique({ where: { id: userId } });
                if (targetUser?.isProtected) {
                    return this.error(res, 'Permissões de usuário protegido não podem ser alteradas', 403);
                }
                const existing = await db_1.prisma.userPermission.findUnique({
                    where: {
                        userId_permissionId: { userId, permissionId }
                    }
                });
                if (existing) {
                    return this.badRequest(res, 'O usuário já possui esta permissão');
                }
                const created = await db_1.prisma.userPermission.create({
                    data: { userId, permissionId },
                    include: { permission: true }
                });
                return res.status(201).json(created);
            }
            catch (error) {
                console.error('Error assigning permission:', error);
                return this.error(res, 'Erro ao atribuir permissão');
            }
        };
        // Remover uma permissão de um usuário
        this.revokePermission = async (req, res) => {
            const { userId, permissionId } = req.params;
            try {
                const targetUser = await db_1.prisma.user.findUnique({ where: { id: userId } });
                if (targetUser?.isProtected) {
                    return this.error(res, 'Permissões de usuário protegido não podem ser alteradas', 403);
                }
                await db_1.prisma.userPermission.delete({
                    where: {
                        userId_permissionId: { userId, permissionId }
                    }
                });
                return res.status(204).send();
            }
            catch (error) {
                console.error('Error revoking permission:', error);
                return this.error(res, 'Erro ao remover permissão');
            }
        };
        // Sincronizar (substituir todas) permissões de um usuário
        this.syncUserPermissions = async (req, res) => {
            const { userId, permissionIds } = req.body;
            try {
                if (!userId || !Array.isArray(permissionIds)) {
                    return this.badRequest(res, 'ID do usuário e lista de IDs de permissões são obrigatórios');
                }
                const targetUser = await db_1.prisma.user.findUnique({ where: { id: userId } });
                if (targetUser?.isProtected) {
                    return this.error(res, 'Permissões de usuário protegido não podem ser alteradas', 403);
                }
                // Usar transação para garantir atomicidade
                await db_1.prisma.$transaction([
                    db_1.prisma.userPermission.deleteMany({ where: { userId } }),
                    db_1.prisma.userPermission.createMany({
                        data: permissionIds.map(permissionId => ({ userId, permissionId }))
                    })
                ]);
                return res.status(204).send();
            }
            catch (error) {
                console.error('Error syncing user permissions:', error);
                return this.error(res, 'Erro ao sincronizar permissões');
            }
        };
    }
}
exports.PermissionsController = PermissionsController;
