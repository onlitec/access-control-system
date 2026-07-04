"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
class UserController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.listUsers = async (req, res) => {
            try {
                const users = await db_1.prisma.user.findMany({
                    select: { id: true, email: true, name: true, role: true, isProtected: true, createdAt: true },
                    orderBy: { createdAt: 'desc' }
                });
                return res.json(users);
            }
            catch (error) {
                console.error('List Users Error:', error);
                return this.error(res, error.message);
            }
        };
        this.createUser = async (req, res) => {
            try {
                const { email, password, name, role } = req.body;
                if (!email || !password || !name) {
                    return this.badRequest(res, 'Email, senha e nome são obrigatórios');
                }
                const hashedPassword = await bcryptjs_1.default.hash(password, 12);
                const user = await db_1.prisma.user.create({
                    data: { email, password: hashedPassword, name, role: role || 'ADMIN' },
                });
                const { password: _, ...userWithoutPassword } = user;
                return res.json(userWithoutPassword);
            }
            catch (error) {
                console.error('Create User Error:', error);
                return this.error(res, error.message);
            }
        };
        this.updateUser = async (req, res) => {
            try {
                const { id } = req.params;
                const { email, password, name, role } = req.body;
                const user = await db_1.prisma.user.findUnique({ where: { id } });
                if (!user)
                    return this.notFound(res, 'Usuário não encontrado');
                if (user.isProtected) {
                    // If protected, only allow changing the name. 
                    // email, password and role are locked.
                    if (email && email !== user.email)
                        return this.error(res, 'Email de usuário protegido não pode ser alterado', 403);
                    if (password)
                        return this.error(res, 'Senha de usuário protegido não pode ser alterada', 403);
                    if (role && role !== user.role)
                        return this.error(res, 'Role de usuário protegido não pode ser alterado', 403);
                }
                const data = { name };
                if (email && !user.isProtected)
                    data.email = email;
                if (role && !user.isProtected)
                    data.role = role;
                if (password && !user.isProtected) {
                    data.password = await bcryptjs_1.default.hash(password, 12);
                }
                const updatedUser = await db_1.prisma.user.update({
                    where: { id },
                    data
                });
                const { password: _, ...userWithoutPassword } = updatedUser;
                return res.json(userWithoutPassword);
            }
            catch (error) {
                console.error('Update User Error:', error);
                return this.error(res, error.message);
            }
        };
        this.deleteUser = async (req, res) => {
            try {
                const user = await db_1.prisma.user.findUnique({ where: { id: req.params.id } });
                if (user?.isProtected) {
                    return this.error(res, 'Usuário protegido não pode ser removido', 403);
                }
                await db_1.prisma.user.delete({ where: { id: req.params.id } });
                return res.status(204).send();
            }
            catch (error) {
                console.error('Delete User Error:', error);
                return this.error(res, error.message);
            }
        };
        this.listProfiles = async (req, res) => {
            try {
                const users = await db_1.prisma.user.findMany({
                    select: { id: true, email: true, name: true, role: true, createdAt: true }
                });
                return res.json(users);
            }
            catch (error) {
                console.error('List Profiles Error:', error);
                return this.error(res, error.message);
            }
        };
        this.getProfile = async (req, res) => {
            try {
                const user = await db_1.prisma.user.findUnique({
                    where: { id: req.params.id },
                    select: { id: true, email: true, name: true, role: true, createdAt: true }
                });
                if (!user)
                    return this.notFound(res, 'Usuário não encontrado');
                return res.json(user);
            }
            catch (error) {
                console.error('Get Profile Error:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.UserController = UserController;
