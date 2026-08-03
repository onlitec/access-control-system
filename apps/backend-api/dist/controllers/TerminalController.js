"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalController = void 0;
const HikCentralService_1 = require("../services/HikCentralService");
class TerminalController {
    constructor() {
        /**
         * GET /api/admin/terminals
         * Listar terminais de reconhecimento facial sincronizados no HikCentral
         */
        this.listTerminals = async (req, res) => {
            try {
                // Standalone: sem HikCentral não existem terminais externos a listar
                if (!(await HikCentralService_1.HikCentralService.isConfigured())) {
                    res.json({ success: true, data: [], total: 0 });
                    return;
                }
                const pageNo = parseInt(req.query.pageNo) || 1;
                const pageSize = parseInt(req.query.pageSize) || 100;
                const result = await HikCentralService_1.HikCentralService.getAcsDeviceList(pageNo, pageSize);
                const list = result?.data?.list || [];
                // Mapear para um formato mais amigável para o frontend
                const terminals = list.map((device) => ({
                    id: device.acsDeviceIndexCode || device.indexCode,
                    name: device.acsDeviceName || device.name,
                    ip: device.acsDeviceIp || device.ip,
                    port: device.acsDevicePort || device.port,
                    status: device.status,
                    isOnline: device.status === 1,
                    treatAsCamera: true // Para fins de UI, tratamos como câmera para captura
                }));
                res.json({ success: true, data: terminals, total: result?.data?.total || terminals.length });
            }
            catch (error) {
                console.error('[TerminalController] listTerminals error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/terminals/capture/:id
         * Capturar foto de um terminal específico
         */
        this.capturePhoto = async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    return res.status(400).json({ success: false, error: 'ID do terminal é obrigatório' });
                }
                const buffer = await HikCentralService_1.HikCentralService.captureCameraPicture(id);
                // Retornar como Base64 para facilitar uso em img src no frontend
                const base64 = buffer.toString('base64');
                res.json({
                    success: true,
                    data: `data:image/jpeg;base64,${base64}`
                });
            }
            catch (error) {
                console.error('[TerminalController] capturePhoto error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
    }
}
exports.TerminalController = TerminalController;
