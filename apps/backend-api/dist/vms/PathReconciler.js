"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathReconciler = void 0;
exports.ensureSegmentHookScript = ensureSegmentHookScript;
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const database_1 = require("../database");
const rtsp_1 = require("./rtsp");
const config_1 = require("./config");
/**
 * Hook executado pelo MediaMTX ao fechar cada segmento de gravação.
 *
 * Dois detalhes do MediaMTX no Windows tornam o comando inline inviável:
 *  1. Ele NÃO roda o comando através de um shell — apenas separa a string em
 *     campos e executa, passando MTX_PATH/MTX_SEGMENT_PATH como variáveis de
 *     ambiente. Sem shell, ninguém expande `%VAR%`: o vms-service recebia a
 *     string literal "%MTX_PATH%" e descartava o segmento ("path desconhecido").
 *  2. Ao separar em campos, as aspas do comando se perdem — então embutir
 *     `cmd.exe /C curl ... -H "x-vms-token: ..."` também não funciona.
 *
 * A saída é um script gerado em disco: o MediaMTX chama o script, e o script
 * (rodando no shell) expande as variáveis e monta a chamada com as aspas certas.
 * Sem isso, as gravações só entravam na fila de upload pela varredura de reserva
 * (a cada 5 min), nunca no fechamento do arquivo.
 */
function hookScriptPath() {
    const isWin = process.platform === 'win32';
    return path_1.default.join(path_1.default.dirname(config_1.VMS_RECORDINGS_DIR), isWin ? 'vms-segment-hook.bat' : 'vms-segment-hook.sh');
}
/** Escreve o script do hook (idempotente — reescrito a cada boot do vms-service). */
async function ensureSegmentHookScript() {
    const isWin = process.platform === 'win32';
    const file = hookScriptPath();
    const url = `http://127.0.0.1:${config_1.VMS_PORT}/internal/segment-complete`;
    const content = isWin
        ? '@echo off\r\n'
            + `curl.exe -s -m 10 -X POST ${url} `
            + `-H "x-vms-token: ${config_1.VMS_INTERNAL_TOKEN}" `
            + '--data-urlencode "path=%MTX_PATH%" --data-urlencode "file=%MTX_SEGMENT_PATH%"\r\n'
        : '#!/bin/sh\n'
            + `curl -s -m 10 -X POST ${url} `
            + `-H "x-vms-token: ${config_1.VMS_INTERNAL_TOKEN}" `
            + '--data-urlencode "path=$MTX_PATH" --data-urlencode "file=$MTX_SEGMENT_PATH"\n';
    await fs_1.promises.mkdir(path_1.default.dirname(file), { recursive: true });
    await fs_1.promises.writeFile(file, content, { mode: isWin ? undefined : 0o755 });
}
/**
 * Transporte RTSP que o MediaMTX deve usar para puxar a câmera, lido do
 * sdkConfig do dispositivo (`{"rtspTransport":"udp"}`). Padrão "tcp".
 * Valores aceitos pelo MediaMTX: automatic | udp | multicast | tcp.
 */
function rtspTransportOf(sdkConfig) {
    const allowed = ['automatic', 'udp', 'multicast', 'tcp'];
    try {
        const cfg = typeof sdkConfig === 'string' ? JSON.parse(sdkConfig) : sdkConfig;
        const t = cfg && typeof cfg === 'object' ? String(cfg.rtspTransport || '').toLowerCase() : '';
        if (allowed.includes(t))
            return t;
    }
    catch { /* sdkConfig malformado — cai no padrão */ }
    return 'tcp';
}
function segmentCompleteHook() {
    // .bat não é executável pelo CreateProcess do Windows — precisa do cmd.exe;
    // o caminho não tem espaços, então não há aspas para o MediaMTX perder.
    return process.platform === 'win32'
        ? `cmd.exe /C ${hookScriptPath()}`
        : `sh ${hookScriptPath()}`;
}
/**
 * Sincroniza os paths do MediaMTX com o banco (video_devices/video_channels):
 * cria os que faltam, corrige source divergente e remove os órfãos. Todos os
 * paths configurados no MediaMTX são de propriedade do VMS (o yml base não
 * define nenhum path estático).
 *
 * record/sourceOnDemand são geridos pelo RecordingScheduler — aqui só se
 * definem os valores iniciais (on-demand, sem gravação) na criação do path.
 */
class PathReconciler {
    constructor(mtx) {
        this.mtx = mtx;
    }
    async reconcile() {
        const devices = await database_1.prisma.videoDevice.findMany({
            where: { enabled: true },
            include: { channels: { where: { enabled: true } } },
        });
        // pathName -> { source RTSP, transporte }. O transporte é TCP por padrão
        // (mais confiável e o que os DVRs Hik/Xiongmai/Dahua usam); câmeras que só
        // falam UDP (ex.: Yoosee/Gwelltimes) declaram {"rtspTransport":"udp"} no
        // sdkConfig do dispositivo.
        const desired = new Map();
        for (const device of devices) {
            const transport = rtspTransportOf(device.sdkConfig);
            for (const channel of device.channels) {
                const urls = (0, rtsp_1.buildStreamUrls)(device, channel);
                if (!urls.main) {
                    console.warn(`[VMS] Canal ${channel.name} (${channel.streamPath}) sem URL RTSP — cadastre a URL manual`);
                    continue;
                }
                desired.set(channel.streamPath, { source: urls.main, transport });
                if (urls.sub && urls.sub !== urls.main) {
                    desired.set((0, rtsp_1.subPathName)(channel.streamPath), { source: urls.sub, transport });
                }
            }
        }
        const existing = await this.mtx.listConfigPaths();
        const existingByName = new Map(existing.map((p) => [p.name, p]));
        for (const p of existing) {
            if (!desired.has(p.name)) {
                try {
                    await this.mtx.deletePath(p.name);
                    console.log(`[VMS] Path removido do MediaMTX: ${p.name}`);
                }
                catch (err) {
                    console.error(`[VMS] Falha ao remover path ${p.name}: ${err.message}`);
                }
            }
        }
        const hook = segmentCompleteHook();
        for (const [name, { source, transport }] of desired) {
            const current = existingByName.get(name);
            // sourceOnDemand=false mantém a câmera conectada o tempo todo: quando o
            // operador abre o app, o vídeo já está fluindo (sem esperar o RTSP subir
            // e o primeiro keyframe chegar)
            const onDemand = !config_1.VMS_ALWAYS_ON;
            const conf = {
                source,
                rtspTransport: transport,
                runOnRecordSegmentComplete: hook,
            };
            try {
                if (!current) {
                    await this.mtx.addPath(name, { ...conf, sourceOnDemand: onDemand, record: false });
                    console.log(`[VMS] Path criado no MediaMTX: ${name}${onDemand ? '' : ' (sempre conectado)'}`);
                }
                else if (current.source !== source
                    || current.rtspTransport !== transport
                    || current.runOnRecordSegmentComplete !== hook
                    || (config_1.VMS_ALWAYS_ON && current.sourceOnDemand)) {
                    await this.mtx.patchPath(name, { ...conf, ...(config_1.VMS_ALWAYS_ON ? { sourceOnDemand: false } : {}) });
                    console.log(`[VMS] Path atualizado no MediaMTX: ${name}`);
                }
            }
            catch (err) {
                console.error(`[VMS] Falha ao sincronizar path ${name}: ${err.message}`);
            }
        }
    }
}
exports.PathReconciler = PathReconciler;
