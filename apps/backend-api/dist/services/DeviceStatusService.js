"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceStatusService = void 0;
const net_1 = __importDefault(require("net"));
const client_1 = require("@prisma/client");
const VideoDoorbellService_1 = require("./VideoDoorbellService");
const NiceGuaritaProtocol_1 = require("./NiceGuaritaProtocol");
const HikCentralService_1 = require("./HikCentralService");
const FacialAccessService_1 = require("./FacialAccessService");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const prisma = new client_1.PrismaClient();
/** Checagem de conectividade dos dispositivos de vídeo do VMS (câmeras/NVRs/DVRs). */
const VmsDeviceStatus = {
    async testConnection(d) {
        if (d.protocol === 'hikvision_isapi') {
            try {
                const res = await (0, digest_fetch_utils_1.digestFetch)(`http://${d.ip}:${d.httpPort}/ISAPI/System/deviceInfo`, d.username, d.password);
                return res.ok || res.status === 401;
            }
            catch {
                return false;
            }
        }
        // onvif/rtsp genérico: alcance TCP na porta RTSP
        return new Promise((resolve) => {
            const socket = new net_1.default.Socket();
            const done = (ok) => { socket.destroy(); resolve(ok); };
            socket.setTimeout(4000);
            socket.once('connect', () => done(true));
            socket.once('timeout', () => done(false));
            socket.once('error', () => done(false));
            socket.connect(d.rtspPort, d.ip);
        });
    },
};
/**
 * Agrega o status de TODOS os dispositivos que a plataforma conhece:
 *   - videoporteiros locais (doorbell_devices, checagem ISAPI direta)
 *   - módulos Guarita MG3000 locais (guarita_devices, ping do protocolo Nice)
 *   - controladores do HikCentral (apenas quando a integração está configurada)
 * No modo standalone (sem HikCentral) os dispositivos locais continuam sendo
 * verificados — antes o endpoint dependia só do HikCentral e tudo aparecia
 * offline/vazio mesmo com os equipamentos respondendo na rede.
 */
class DeviceStatusService {
    /** Status agregado — responde na hora com o último resultado conhecido. */
    static async getAll() {
        const age = Date.now() - this.lastRefresh;
        if (this.lastRefresh > 0 && age < this.MAX_AGE_MS) {
            if (age > 30000)
                void this.refresh().catch(() => { }); // renova em background
            return this.cache;
        }
        return this.refresh(); // boot/cache expirado: varredura síncrona única
    }
    /** Varredura real (coalescida: chamadas concorrentes compartilham a mesma). */
    static async refresh() {
        if (this.refreshing)
            return this.refreshing;
        this.refreshing = (async () => {
            try {
                const [local, hik] = await Promise.all([
                    this.getLocalDevices(),
                    this.getHikCentralDevices(),
                ]);
                this.cache = [...local, ...hik];
                this.lastRefresh = Date.now();
                return this.cache;
            }
            finally {
                this.refreshing = null;
            }
        })();
        return this.refreshing;
    }
    /** Mantém o cache quente — chamado uma vez no boot (server.ts). */
    static startBackgroundRefresh(intervalMs = 30000) {
        void this.refresh().catch(() => { });
        setInterval(() => { void this.refresh().catch(() => { }); }, intervalMs);
    }
    static async getLocalDevices() {
        const [doorbells, guaritas, facialDevices, videoDevices] = await Promise.all([
            prisma.doorbellDevice.findMany({ where: { enabled: true } }),
            prisma.guaritaDevice.findMany({ where: { enabled: true } }),
            prisma.facialAccessDevice.findMany({ where: { enabled: true } }),
            prisma.videoDevice.findMany({ where: { enabled: true } }),
        ]);
        // Vários "portões" lógicos do Guarita compartilham o mesmo módulo físico
        // (ip:porta) — pinga cada módulo uma vez e reaproveita o resultado.
        const guaritaPings = new Map();
        const pingGuarita = (ip, port) => {
            const key = `${ip}:${port}`;
            if (!guaritaPings.has(key))
                guaritaPings.set(key, NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(ip, port));
            return guaritaPings.get(key);
        };
        const checks = [
            ...doorbells.map(async (d) => ({
                id: d.id,
                name: d.name,
                ip: d.ip,
                type: 'Videoporteiro',
                location: d.location,
                status: (await VideoDoorbellService_1.VideoDoorbellService.testConnection(d.ip, d.port, d.username, d.password))
                    ? 'online' : 'offline',
            })),
            ...guaritas.map(async (d) => ({
                id: d.id,
                name: d.name,
                ip: d.ip,
                type: 'Guarita IP (MG3000)',
                location: d.location,
                status: (await pingGuarita(d.ip, d.port)) ? 'online' : 'offline',
            })),
            ...facialDevices.map(async (d) => ({
                id: d.id,
                name: d.name,
                ip: d.ip,
                type: d.role === 'controller' ? 'Controladora Facial' : 'Leitor Facial',
                location: d.location,
                status: (await FacialAccessService_1.FacialAccessService.testConnection(d.ip, d.port, d.username, d.password))
                    ? 'online' : 'offline',
            })),
            ...videoDevices.map(async (d) => ({
                id: d.id,
                name: d.name,
                ip: d.ip,
                type: d.kind === 'nvr' ? 'NVR' : d.kind === 'dvr' ? 'DVR' : 'Câmera IP',
                location: d.location,
                status: (await VmsDeviceStatus.testConnection(d)) ? 'online' : 'offline',
            })),
        ];
        return Promise.all(checks);
    }
    static async getHikCentralDevices() {
        try {
            // Standalone: sem HikCentral configurado, nem tenta a chamada
            if (!(await HikCentralService_1.HikCentralService.isConfigured()))
                return [];
            const deviceResult = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 100);
            const devices = deviceResult?.data?.list || [];
            return devices.map((d) => ({
                id: d.acsDevIndexCode || d.acsDeviceIndexCode,
                name: d.acsDevName || d.acsDeviceName,
                status: d.status === 1 ? 'online' : 'offline',
                ip: d.acsDevIp || d.acsDeviceIp,
                type: d.treatyType || d.acsDeviceType,
            }));
        }
        catch {
            // Standalone: HikCentral não configurado — só dispositivos locais
            return [];
        }
    }
}
exports.DeviceStatusService = DeviceStatusService;
// ── Cache com atualização em segundo plano ─────────────────────────────────
// As sondas de conectividade custam caro quando há equipamento fora do ar
// (até 5s de timeout cada; pings de Guarita ao MESMO módulo são serializados
// na conexão compartilhada — 4 portões inalcançáveis = ~20s). O dashboard e a
// página de status leem o cache; a varredura real roda em background.
DeviceStatusService.cache = [];
DeviceStatusService.lastRefresh = 0;
DeviceStatusService.refreshing = null;
DeviceStatusService.MAX_AGE_MS = 90000;
