"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoDoorbellService = void 0;
const child_process_1 = require("child_process");
const client_1 = require("@prisma/client");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const prisma = new client_1.PrismaClient();
/**
 * Hikvision DS-KB / DS-KV series video doorbell integration via ISAPI (direct HTTP).
 * Does NOT require HikCentral — connects directly to the device on the local network.
 * Uses Digest Auth (MD5) as required by Hikvision firmware.
 */
class VideoDoorbellService {
    static async getDevice(deviceId) {
        const device = await prisma.doorbellDevice.findUnique({ where: { id: deviceId } });
        if (!device)
            throw new Error(`Videoporteiro ${deviceId} não encontrado`);
        if (!device.enabled)
            throw new Error(`Videoporteiro ${deviceId} está desabilitado`);
        return device;
    }
    /**
     * Captura 1 frame do stream RTSP via ffmpeg (sub-stream 102).
     * As door stations DS-KB/DS-KV não implementam o /picture do ISAPI — a
     * requisição fica pendurada para sempre — então o RTSP é o caminho titular.
     */
    static snapshotViaRtsp(device, timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            const pass = encodeURIComponent(device.password);
            const rtspUrl = `rtsp://${device.username}:${pass}@${device.ip}:554/Streaming/Channels/102`;
            const proc = (0, child_process_1.spawn)('ffmpeg', [
                '-loglevel', 'error',
                '-rtsp_transport', 'tcp',
                '-i', rtspUrl,
                '-frames:v', '1',
                '-q:v', '4',
                '-f', 'image2pipe',
                '-c:v', 'mjpeg',
                'pipe:1',
            ]);
            const chunks = [];
            let settled = false;
            const settle = (fn) => { if (!settled) {
                settled = true;
                fn();
            } };
            const timer = setTimeout(() => {
                try {
                    proc.kill('SIGKILL');
                }
                catch { /* já morreu */ }
                settle(() => reject(new Error(`RTSP snapshot timeout (${device.ip})`)));
            }, timeoutMs);
            proc.stdout.on('data', (c) => chunks.push(c));
            proc.stderr.on('data', () => { });
            proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(err)); });
            proc.on('close', () => {
                clearTimeout(timer);
                const buf = Buffer.concat(chunks);
                if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
                    settle(() => resolve(buf));
                }
                else {
                    settle(() => reject(new Error(`RTSP snapshot sem frame JPEG (${device.ip})`)));
                }
            });
        });
    }
    static async getSnapshot(deviceId) {
        const device = await this.getDevice(deviceId);
        // 1º: frame do RTSP via ffmpeg (funciona em door stations e câmeras)
        let lastError;
        try {
            return await this.snapshotViaRtsp(device);
        }
        catch (err) {
            lastError = err;
        }
        // Fallback: ISAPI /picture (modelos que implementam, ex.: câmeras IP/NVR)
        const paths = [
            '/ISAPI/Streaming/channels/101/picture',
            '/ISAPI/Streaming/channels/1/picture',
        ];
        for (const path of paths) {
            try {
                const url = `http://${device.ip}:${device.port}${path}`;
                const response = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
                        return buffer;
                    }
                    lastError = new Error(`Resposta em ${path} não é JPEG válido`);
                }
                else {
                    lastError = new Error(`ISAPI snapshot falhou em ${path}: ${response.status} ${response.statusText}`);
                }
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError;
    }
    static async getDeviceInfo(deviceId) {
        const device = await this.getDevice(deviceId);
        const url = `http://${device.ip}:${device.port}/ISAPI/System/deviceInfo`;
        const response = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password);
        if (!response.ok) {
            throw new Error(`ISAPI deviceInfo falhou: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        return {
            deviceName: text.match(/<deviceName>(.*?)<\/deviceName>/)?.[1],
            serialNumber: text.match(/<serialNumber>(.*?)<\/serialNumber>/)?.[1],
            firmwareVersion: text.match(/<firmwareVersion>(.*?)<\/firmwareVersion>/)?.[1],
            macAddress: text.match(/<macAddress>(.*?)<\/macAddress>/)?.[1],
            model: text.match(/<model>(.*?)<\/model>/)?.[1],
        };
    }
    static async testConnection(ip, port, username, password) {
        try {
            const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
            const response = await (0, digest_fetch_utils_1.digestFetch)(url, username, password);
            // 200 = auth OK, 401 = reachable but wrong credentials, both mean the device is there
            return response.ok || response.status === 401;
        }
        catch {
            return false;
        }
    }
    static async listDevices() {
        return prisma.doorbellDevice.findMany({
            where: { enabled: true },
            select: { id: true, name: true, location: true, ip: true, port: true, enabled: true, createdAt: true },
            orderBy: { name: 'asc' },
        });
    }
}
exports.VideoDoorbellService = VideoDoorbellService;
