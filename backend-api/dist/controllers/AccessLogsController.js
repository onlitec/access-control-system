"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccessLogsController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
const HikCentralService_1 = require("../services/HikCentralService");
const HikCentralResourceService_1 = require("../services/HikCentralResourceService");
const HIK_EXIT_EVENT_TYPES = new Set([196608, 196609, 196610]);
class AccessLogsController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.getAccessLogs = async (req, res) => {
            try {
                const { startTime, endTime, pageNo = 1, pageSize = 200, source = 'all' } = req.query;
                const start = startTime || new Date(Date.now() - 86400000).toISOString();
                const end = endTime || new Date().toISOString();
                if (source !== 'local') {
                    try {
                        const rawEvents = await this.fetchHikAccessLogs(start, end, parseInt(pageSize));
                        return res.json({
                            data: rawEvents,
                            total: rawEvents.length,
                            source: 'hikcentral',
                        });
                    }
                    catch (hikError) {
                        console.warn('[AccessLogs] HikCentral unavailable, falling back to local DB:', hikError.message);
                    }
                }
                const where = {
                    eventTime: {
                        gte: new Date(start),
                        lte: new Date(end),
                    },
                };
                const skip = (parseInt(pageNo) - 1) * parseInt(pageSize);
                const data = await db_1.prisma.accessEvent.findMany({
                    where,
                    skip,
                    take: parseInt(pageSize),
                    orderBy: { eventTime: 'desc' },
                });
                const total = await db_1.prisma.accessEvent.count({ where });
                return res.json({ data, total, source: 'local' });
            }
            catch (error) {
                console.error('Access Logs Error:', error);
                return this.error(res, error.message);
            }
        };
    }
    async fetchHikAccessLogs(start, end, limit = 200) {
        try {
            // 1. Obter todas as portas (necessário para o filtro de eventos de porta)
            const doors = await HikCentralResourceService_1.HikCentralResourceService.getDoors();
            const doorCodes = doors.map(d => d.doorIndexCode);
            if (doorCodes.length === 0)
                return [];
            // 2. Definir tipos de eventos relevantes (Passagem facial, cartao, qr code, etc.)
            // 196881 = Legal face authentication passed
            // 197141 = Face verification passed (ACS device)
            // 196894 = QR code passed
            const EVENT_TYPES = [196881, 197141, 196894, 196883];
            // 3. Buscar eventos no HikCentral
            const res = await HikCentralService_1.HikCentralService.getAccessLogs({
                pageNo: 1,
                pageSize: limit,
                startTime: start.replace(/\.\d{3}Z$/, '+00:00'),
                endTime: end.replace(/\.\d{3}Z$/, '+00:00'),
                doorIndexCodes: doorCodes,
                eventTypes: EVENT_TYPES
            });
            if (res.code !== '0' || !res.data?.list) {
                console.warn('[AccessLogs] HikCentral events failed:', res.msg);
                return [];
            }
            return res.data.list.map((e) => {
                // Direção: 1=Entrada, 2=Saída (Padrao HikCentral ACS)
                const isExit = e.inAndOutType === 2;
                // Mapeamento simplificado de tipos baseado no que o usuário deseja
                let person_type = 'resident';
                if (e.userType === 'visitor')
                    person_type = 'visitor';
                else if (e.userType === 'staff')
                    person_type = 'staff';
                return {
                    id: e.eventId || `hik-${Math.random()}`,
                    person_name: e.personName || 'Desconhecido',
                    access_time: e.eventTime || e.happenTime,
                    device_name: e.deviceName || 'N/A',
                    access_point: e.doorName || 'Portaria',
                    event_type: isExit ? 'EXIT' : 'ENTRY',
                    direction: isExit ? 'exit' : 'entry',
                    pic_uri: e.picUri || null,
                    person_type: person_type,
                    raw_event_type: e.eventType
                };
            });
        }
        catch (error) {
            console.error('[AccessLogs] fetchHikAccessLogs error:', error.message);
            return [];
        }
    }
}
exports.AccessLogsController = AccessLogsController;
