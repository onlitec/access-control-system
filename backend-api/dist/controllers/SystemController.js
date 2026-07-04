"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
const HikCentralService_1 = require("../services/HikCentralService");
class SystemController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.getHealth = (req, res) => {
            return res.json({ status: 'ok', timestamp: new Date().toISOString() });
        };
        this.getStatus = async (req, res) => {
            try {
                // Check DB connectivity
                let dbStatus = 'OFFLINE';
                try {
                    await db_1.prisma.$queryRaw `SELECT 1`;
                    dbStatus = 'ONLINE';
                }
                catch {
                    dbStatus = 'OFFLINE';
                }
                // Check HikCentral connectivity
                let hikStatus = 'UNKNOWN';
                try {
                    await HikCentralService_1.HikCentralService.getAccessLogs({
                        startTime: new Date(Date.now() - 60000).toISOString(),
                        endTime: new Date().toISOString(),
                        pageNo: 1,
                        pageSize: 1,
                    });
                    hikStatus = 'ONLINE';
                }
                catch {
                    hikStatus = 'OFFLINE';
                }
                return res.json({
                    api: 'ONLINE',
                    database: dbStatus,
                    hikcentral: hikStatus,
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                });
            }
            catch (error) {
                console.error('System Status Error:', error);
                return this.error(res, error.message);
            }
        };
        this.getDevicesStatus = async (req, res) => {
            try {
                const deviceResult = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 100);
                const devices = deviceResult?.data?.list || [];
                const formattedDevices = devices.map((d) => ({
                    id: d.acsDevIndexCode || d.acsDeviceIndexCode,
                    name: d.acsDevName || d.acsDeviceName,
                    status: d.status === 1 ? 'online' : 'offline',
                    ip: d.acsDevIp || d.acsDeviceIp,
                    type: d.treatyType || d.acsDeviceType
                }));
                return res.json(formattedDevices);
            }
            catch (error) {
                console.error('Devices Status Error:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.SystemController = SystemController;
