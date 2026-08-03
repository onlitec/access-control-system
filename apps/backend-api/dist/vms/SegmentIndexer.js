"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentIndexer = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const database_1 = require("../database");
const config_1 = require("./config");
/** `cam-x-sub` e `cam-x` são o mesmo canal (streamPath = `cam-x`). */
function channelPathOf(mtxPath) {
    return mtxPath.endsWith('-sub') ? mtxPath.slice(0, -4) : mtxPath;
}
/**
 * Um arquivo tocado há poucos segundos provavelmente AINDA ESTÁ SENDO GRAVADO.
 * Indexá-lo como "fechado" faria o upload tentar enviar um arquivo que cresce
 * durante a transferência — o rclone aborta com "source file is being updated".
 */
const STILL_RECORDING_MS = 90000;
function isProbablyOpen(mtimeMs) {
    return Date.now() - mtimeMs < STILL_RECORDING_MS;
}
/** Extrai o início da gravação do nome `%Y-%m-%d_%H-%M-%S-%f.mp4` (hora local). */
function parseStartFromFilename(fileName) {
    const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    if (!m)
        return null;
    const [, y, mo, d, h, mi, s] = m.map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    return isNaN(date.getTime()) ? null : date;
}
/**
 * Indexa os segmentos fMP4 gravados pelo MediaMTX na tabela recording_segments
 * e enfileira o upload para os destinos remotos habilitados. Alimentado pelo
 * hook runOnRecordSegmentComplete; o scan de boot cobre segmentos gravados
 * enquanto o vms-service estava fora do ar.
 */
class SegmentIndexer {
    constructor(scheduler) {
        this.scheduler = scheduler;
    }
    async handleSegmentComplete(mtxPath, absFile) {
        const channel = await database_1.prisma.videoChannel.findUnique({
            where: { streamPath: channelPathOf(mtxPath) },
        });
        if (!channel) {
            console.warn(`[VMS] Segmento de path desconhecido ignorado: ${mtxPath}`);
            return;
        }
        await this.indexFile(channel.id, absFile, this.scheduler.triggerForPath(mtxPath));
    }
    async indexFile(channelId, absFile, trigger) {
        let stat;
        try {
            stat = await fs_1.promises.stat(absFile);
        }
        catch {
            console.warn(`[VMS] Segmento não encontrado no disco: ${absFile}`);
            return;
        }
        const relPath = path_1.default.relative(config_1.VMS_RECORDINGS_DIR, absFile).split(path_1.default.sep).join('/');
        const startedAt = parseStartFromFilename(path_1.default.basename(absFile)) ?? stat.birthtime;
        const segment = await database_1.prisma.recordingSegment.upsert({
            where: { filePath: relPath },
            create: {
                channelId,
                startedAt,
                endedAt: stat.mtime,
                filePath: relPath,
                sizeBytes: BigInt(stat.size),
                trigger,
                status: 'closed',
            },
            update: {
                endedAt: stat.mtime,
                sizeBytes: BigInt(stat.size),
                status: 'closed',
            },
        });
        const destinations = await database_1.prisma.storageDestination.findMany({
            where: { enabled: true, kind: 'rclone' },
            select: { id: true },
        });
        if (destinations.length > 0) {
            await database_1.prisma.recordingUpload.createMany({
                data: destinations.map((d) => ({ segmentId: segment.id, destinationId: d.id })),
                skipDuplicates: true,
            });
        }
    }
    /**
     * Indexa NA HORA os arquivos recém-fechados de um path — usado ao PARAR a
     * gravação manual. O scan geral (reconcileOrphans) pula arquivos modificados
     * há menos de 90s por presumir que ainda estão sendo gravados; aqui a
     * gravação acabou de ser DESLIGADA no path, então o arquivo novo já está
     * fechado e é exatamente o clipe que o operador quer baixar.
     */
    async indexFreshForPath(channelId, pathName) {
        const files = await this.walkMp4(path_1.default.join(config_1.VMS_RECORDINGS_DIR, pathName));
        if (files.length === 0)
            return;
        const known = new Set((await database_1.prisma.recordingSegment.findMany({
            where: { channelId },
            select: { filePath: true },
        })).map((s) => s.filePath));
        for (const absFile of files) {
            const relPath = path_1.default.relative(config_1.VMS_RECORDINGS_DIR, absFile).split(path_1.default.sep).join('/');
            if (known.has(relPath))
                continue;
            await this.indexFile(channelId, absFile, 'manual');
            console.log(`[VMS] Clipe manual indexado: ${relPath}`);
        }
    }
    /**
     * Scan de reconciliação: percorre VMS_RECORDINGS_DIR e indexa arquivos .mp4
     * que não estão no banco (o primeiro nível de diretório é o path MediaMTX).
     */
    async reconcileOrphans() {
        let entries;
        try {
            entries = await fs_1.promises.readdir(config_1.VMS_RECORDINGS_DIR);
        }
        catch {
            return; // diretório ainda não existe — nada gravado
        }
        const known = new Set((await database_1.prisma.recordingSegment.findMany({ select: { filePath: true } })).map((s) => s.filePath));
        for (const dir of entries) {
            const channelDir = path_1.default.join(config_1.VMS_RECORDINGS_DIR, dir);
            const st = await fs_1.promises.stat(channelDir).catch(() => null);
            if (!st?.isDirectory())
                continue;
            const channel = await database_1.prisma.videoChannel.findUnique({ where: { streamPath: channelPathOf(dir) } });
            if (!channel)
                continue;
            const files = await this.walkMp4(channelDir);
            for (const absFile of files) {
                const relPath = path_1.default.relative(config_1.VMS_RECORDINGS_DIR, absFile).split(path_1.default.sep).join('/');
                if (known.has(relPath))
                    continue;
                // o arquivo da gravação EM ANDAMENTO ainda está crescendo — indexá-lo
                // agora faria o upload tentar enviar um arquivo em movimento
                const st = await fs_1.promises.stat(absFile).catch(() => null);
                if (!st || isProbablyOpen(st.mtimeMs))
                    continue;
                // usa o motivo real da gravação daquele path (manual, motion, agenda...)
                await this.indexFile(channel.id, absFile, this.scheduler.triggerForPath(dir));
                console.log(`[VMS] Segmento órfão indexado: ${relPath}`);
            }
        }
    }
    async walkMp4(dir) {
        const out = [];
        const entries = await fs_1.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
            const full = path_1.default.join(dir, e.name);
            if (e.isDirectory()) {
                out.push(...await this.walkMp4(full));
            }
            else if (e.isFile() && e.name.toLowerCase().endsWith('.mp4')) {
                out.push(full);
            }
        }
        return out;
    }
}
exports.SegmentIndexer = SegmentIndexer;
