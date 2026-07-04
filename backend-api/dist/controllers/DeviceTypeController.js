"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceTypeController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
class DeviceTypeController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        /**
         * GET /api/admin/device-types
         */
        this.getAll = async (req, res) => {
            try {
                const types = await db_1.prisma.deviceType.findMany({
                    orderBy: { name: 'asc' }
                });
                return res.json(types);
            }
            catch (error) {
                console.error('[DeviceTypeController] Error fetching device types:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * POST /api/admin/device-types
         */
        this.create = async (req, res) => {
            try {
                const { name, description, icon } = req.body;
                if (!name)
                    return this.badRequest(res, 'Name is required');
                const type = await db_1.prisma.deviceType.create({
                    data: { name, description, icon }
                });
                return this.success(res, type, 'Tipo de dispositivo criado com sucesso');
            }
            catch (error) {
                console.error('[DeviceTypeController] Error creating device type:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * PATCH /api/admin/device-types/:id
         */
        this.update = async (req, res) => {
            try {
                const { id } = req.params;
                const { name, description, icon } = req.body;
                const type = await db_1.prisma.deviceType.update({
                    where: { id },
                    data: { name, description, icon }
                });
                return this.success(res, type, 'Tipo de dispositivo atualizado com sucesso');
            }
            catch (error) {
                console.error('[DeviceTypeController] Error updating device type:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * DELETE /api/admin/device-types/:id
         */
        this.delete = async (req, res) => {
            try {
                const { id } = req.params;
                // Check if there are devices associated with this type
                const devicesCount = await db_1.prisma.device.count({
                    where: { typeId: id }
                });
                if (devicesCount > 0) {
                    return this.badRequest(res, 'Não é possível excluir um tipo que possui dispositivos vinculados');
                }
                await db_1.prisma.deviceType.delete({
                    where: { id }
                });
                return this.success(res, null, 'Tipo de dispositivo excluído com sucesso');
            }
            catch (error) {
                console.error('[DeviceTypeController] Error deleting device type:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.DeviceTypeController = DeviceTypeController;
