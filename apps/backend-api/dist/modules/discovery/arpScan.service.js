"use strict";
/**
 * arpScan.service.ts
 * Varredura ativa de rede: ARP scan + port probe nas portas típicas de dispositivos CFTV/acesso.
 * Fallback para redes sem multicast/broadcast habilitado.
 * No Windows usa `arp -a` via child_process; em Linux usa `arp-scan` ou `ip neigh`.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.arpScan = arpScan;
const child_process_1 = require("child_process");
const util_1 = require("util");
const net_1 = __importDefault(require("net"));
const os_1 = __importDefault(require("os"));
const device_fingerprint_util_1 = require("./device-fingerprint.util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/** Portas tipicamente abertas em câmeras/NVRs/controladoras. */
const DEVICE_PORTS = [80, 443, 554, 8000, 8080, 37777];
const PORT_TIMEOUT_MS = 800;
const ARP_TIMEOUT_MS = 30000;
/** Parseia saída do `arp -a` no Windows e Linux. */
function parseArpOutput(raw) {
    const entries = [];
    const lines = raw.split('\n');
    for (const line of lines) {
        // Windows: "  192.168.1.1          aa-bb-cc-dd-ee-ff     dynamic"
        // Linux:   "? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0"
        const winMatch = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([\da-f]{2}[-:][\da-f]{2}[-:][\da-f]{2}[-:][\da-f]{2}[-:][\da-f]{2}[-:][\da-f]{2})/i);
        if (winMatch) {
            const ip = winMatch[1];
            const mac = winMatch[2].replace(/-/g, ':').toLowerCase();
            if (!ip.endsWith('.0') && !ip.endsWith('.255')) {
                entries.push({ ip, mac });
            }
        }
    }
    return entries;
}
/** Testa se uma porta TCP está aberta em determinado host. */
async function probePort(ip, port) {
    return new Promise((resolve) => {
        const socket = new net_1.default.Socket();
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, PORT_TIMEOUT_MS);
        socket.connect(port, ip, () => {
            clearTimeout(timer);
            socket.destroy();
            resolve(true);
        });
        socket.on('error', () => { clearTimeout(timer); resolve(false); });
    });
}
/** Determina a sub-rede local do servidor (ex: "192.168.1"). */
function getLocalSubnet() {
    const ifaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        if (name.toLowerCase().includes('loopback') || name.toLowerCase() === 'lo')
            continue;
        for (const iface of ifaces[name] ?? []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const parts = iface.address.split('.');
                return parts.slice(0, 3).join('.');
            }
        }
    }
    return null;
}
async function arpScan(onDevice, options) {
    const subnet = options?.subnetPrefix ?? getLocalSubnet();
    const timeoutMs = options?.timeoutMs ?? ARP_TIMEOUT_MS;
    if (!subnet) {
        console.warn('[Discovery/ARP] Não foi possível determinar a sub-rede local.');
        return;
    }
    // 1. Popula a cache ARP enviando pings rápidos (não aguarda retorno)
    try {
        const pingCmd = process.platform === 'win32'
            ? `for /L %i in (1,1,254) do start /B ping -n 1 -w 100 ${subnet}.%i`
            : `for i in $(seq 1 254); do ping -c 1 -W 1 ${subnet}.$i & done; wait`;
        await Promise.race([
            execAsync(pingCmd).catch(() => { }),
            new Promise((r) => setTimeout(r, Math.min(timeoutMs / 2, 10000))),
        ]);
    }
    catch { }
    // 2. Lê a tabela ARP populada
    let arpEntries = [];
    try {
        const { stdout } = await execAsync('arp -a');
        arpEntries = parseArpOutput(stdout);
    }
    catch (e) {
        console.warn('[Discovery/ARP] Falha ao ler tabela ARP:', e);
        return;
    }
    // 3. Para cada host ARP, verifica portas abertas de forma concorrente (lotes de 20)
    const batchSize = 20;
    const deadline = Date.now() + timeoutMs;
    for (let i = 0; i < arpEntries.length; i += batchSize) {
        if (Date.now() > deadline)
            break;
        const batch = arpEntries.slice(i, i + batchSize);
        await Promise.all(batch.map(async ({ ip, mac }) => {
            const openPorts = (await Promise.all(DEVICE_PORTS.map((p) => probePort(ip, p).then((open) => ({ p, open })))))
                .filter((r) => r.open)
                .map((r) => r.p);
            if (openPorts.length === 0)
                return;
            const httpPort = openPorts.includes(80) ? 80 : (openPorts.includes(8080) ? 8080 : openPorts[0]);
            // A tabela OUI cobre poucos prefixos; a sonda HTTP identifica o
            // equipamento de verdade (modelo/serial/firmware quando disponível).
            const probed = await (0, device_fingerprint_util_1.probeHttpIdentity)(ip, httpPort).catch(() => null);
            const manufacturer = probed?.manufacturer ?? (0, device_fingerprint_util_1.getManufacturerByMac)(mac);
            const model = probed?.model ?? null;
            const deviceType = (0, device_fingerprint_util_1.inferDeviceType)([], model, manufacturer);
            onDevice({
                tempId: `arp-${ip}-${Date.now()}`,
                ipAddress: ip,
                macAddress: mac,
                protocolType: 'arp',
                manufacturer,
                model,
                serialNumber: probed?.serialNumber ?? null,
                firmwareVersion: probed?.firmwareVersion ?? null,
                deviceType,
                httpPort,
                sdkPort: openPorts.includes(8000) ? 8000 : 8000,
                subnetMask: null,
                gateway: null,
                dhcpEnabled: false,
                isActivated: true,
                isAdded: false,
            });
        }));
    }
}
