"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceController = void 0;
const HikCentralService_1 = require("../services/HikCentralService");
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
class DeviceController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        /**
         * GET /api/devices/status
         * Retorna status dos dispositivos ACS (faciais, catracas, etc) vindos do HikCentral
         */
        this.getDevicesStatus = async (req, res) => {
            try {
                const deviceResult = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 200);
                const devices = deviceResult?.data?.list || [];
                const mapped = devices.map((d) => ({
                    id: d.acsDevIndexCode || d.indexCode || d.deviceId,
                    name: d.acsDevName || d.name || 'Dispositivo',
                    ip: d.acsDevIp || d.ip || '',
                    status: d.status === 1 ? 'online' : 'offline',
                    deviceType: d.devTypeName || d.deviceType || 'ACS',
                    regionName: d.regionName || '',
                }));
                res.json(mapped);
            }
            catch (error) {
                console.warn('[DeviceController] Devices unavailable:', error.message);
                res.json([]);
            }
        };
        /**
         * GET /api/admin/devices
         */
        this.getAll = async (req, res) => {
            try {
                const { typeId } = req.query;
                const where = typeId ? { typeId: String(typeId) } : {};
                const devices = await db_1.prisma.device.findMany({
                    where,
                    include: { type: true },
                    orderBy: { name: 'asc' }
                });
                return res.json(devices);
            }
            catch (error) {
                console.error('[DeviceController] Error fetching devices:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * POST /api/admin/devices
         */
        this.create = async (req, res) => {
            try {
                const { name, ip, port, username, password, typeId, hikIndexCode } = req.body;
                if (!name || !typeId)
                    return this.badRequest(res, 'Name and typeId are required');
                const device = await db_1.prisma.device.create({
                    data: { name, ip, port: Number(port) || 80, username, password, typeId, hikIndexCode }
                });
                return this.success(res, device, 'Dispositivo cadastrado com sucesso');
            }
            catch (error) {
                console.error('[DeviceController] Error creating device:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * PATCH /api/admin/devices/:id
         */
        this.update = async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                if (updates.port)
                    updates.port = Number(updates.port);
                const device = await db_1.prisma.device.update({
                    where: { id },
                    data: updates
                });
                return this.success(res, device, 'Dispositivo atualizado com sucesso');
            }
            catch (error) {
                console.error('[DeviceController] Error updating device:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * DELETE /api/admin/devices/:id
         */
        this.delete = async (req, res) => {
            try {
                const { id } = req.params;
                await db_1.prisma.device.delete({
                    where: { id }
                });
                return this.success(res, null, 'Dispositivo excluído com sucesso');
            }
            catch (error) {
                console.error('[DeviceController] Error deleting device:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.DeviceController = DeviceController;
