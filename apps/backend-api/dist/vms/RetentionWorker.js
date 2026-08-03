"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetentionWorker = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const database_1 = require("../database");
const config_1 = require("./config");
const disk_1 = require("./disk");
/**
 * Limpeza de gravações: (1) retenção por dias configurada em cada canal,
 * (2) teto global de uso (VMS_MAX_DISK_GB) e (3) espaço livre mínimo no volume
 * (VMS_MIN_FREE_GB) — este último é o que impede o disco de encher e derrubar
 * o MediaMTX/PostgreSQL. A linha no banco é mantida com status "deleted_local"
 * para preservar o histórico (e o vínculo com uploads remotos já concluídos).
 */
class RetentionWorker {
    async run() {
        await this.applyPerChannelRetention();
        if (config_1.VMS_MAX_DISK_GB > 0) {
            await this.applyDiskCap();
        }
        await this.ensureFreeSpace();
    }
    /** Apaga os segmentos mais antigos até restaurar o espaço livre mínimo. */
    async ensureFreeSpace() {
        if (config_1.VMS_MIN_FREE_GB <= 0)
            return;
        let info = await (0, disk_1.getDiskInfo)();
        if (!info || info.freeGb >= config_1.VMS_MIN_FREE_GB)
            return;
        console.warn(`[VMS] Espaço livre em disco (${info.freeGb.toFixed(1)} GB) abaixo do mínimo (${config_1.VMS_MIN_FREE_GB} GB) — liberando gravações antigas`);
        let removed = 0;
        for (;;) {
            const batch = await database_1.prisma.recordingSegment.findMany({
                where: {
                    status: 'closed',
                    uploads: { none: { status: { in: ['pending', 'uploading'] } } },
                },
                orderBy: { startedAt: 'asc' },
                select: { id: true, filePath: true },
                take: 50,
            });
            if (batch.length === 0)
                break;
            for (const segment of batch) {
                await this.deleteSegmentFile(segment);
                removed += 1;
            }
            info = await (0, disk_1.getDiskInfo)();
            if (!info || info.freeGb >= config_1.VMS_MIN_FREE_GB)
                break;
        }
        if (removed > 0) {
            const free = (await (0, disk_1.getDiskInfo)())?.freeGb ?? 0;
            console.log(`[VMS] ${removed} segmento(s) removidos por falta de espaço — livre agora: ${free.toFixed(1)} GB`);
        }
        else if (info && info.freeGb < config_1.VMS_MIN_FREE_GB) {
            console.error(`[VMS] ATENÇÃO: disco com apenas ${info.freeGb.toFixed(1)} GB livres e não há gravações a remover — a gravação será pausada`);
        }
    }
    async deleteSegmentFile(segment) {
        const absFile = path_1.default.join(config_1.VMS_RECORDINGS_DIR, segment.filePath);
        try {
            await fs_1.promises.unlink(absFile);
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`[VMS] Falha ao apagar ${absFile}: ${err.message}`);
                return;
            }
        }
        await database_1.prisma.recordingSegment.update({
            where: { id: segment.id },
            data: { status: 'deleted_local' },
        });
    }
    async applyPerChannelRetention() {
        const configs = await database_1.prisma.videoRecordingConfig.findMany({
            select: { channelId: true, retentionDays: true },
        });
        for (const cfg of configs) {
            const cutoff = new Date(Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000);
            const expired = await database_1.prisma.recordingSegment.findMany({
                where: {
                    channelId: cfg.channelId,
                    startedAt: { lt: cutoff },
                    status: { in: ['closed', 'failed'] },
                },
                select: { id: true, filePath: true },
            });
            for (const segment of expired) {
                await this.deleteSegmentFile(segment);
            }
            if (expired.length > 0) {
                console.log(`[VMS] Retenção: ${expired.length} segmento(s) do canal ${cfg.channelId} removidos (> ${cfg.retentionDays} dias)`);
            }
        }
    }
    async applyDiskCap() {
        const capBytes = BigInt(Math.floor(config_1.VMS_MAX_DISK_GB * 1024 * 1024 * 1024));
        const agg = await database_1.prisma.recordingSegment.aggregate({
            where: { status: 'closed' },
            _sum: { sizeBytes: true },
        });
        let total = agg._sum.sizeBytes ?? BigInt(0);
        if (total <= capBytes)
            return;
        // apaga do mais antigo para o mais novo, poupando segmentos com upload em andamento
        const oldest = await database_1.prisma.recordingSegment.findMany({
            where: {
                status: 'closed',
                uploads: { none: { status: { in: ['pending', 'uploading'] } } },
            },
            orderBy: { startedAt: 'asc' },
            select: { id: true, filePath: true, sizeBytes: true },
            take: 500,
        });
        let removed = 0;
        for (const segment of oldest) {
            if (total <= capBytes)
                break;
            await this.deleteSegmentFile(segment);
            total -= segment.sizeBytes;
            removed += 1;
        }
        if (removed > 0) {
            console.log(`[VMS] Limite de disco (${config_1.VMS_MAX_DISK_GB} GB): ${removed} segmento(s) antigos removidos`);
        }
    }
}
exports.RetentionWorker = RetentionWorker;
