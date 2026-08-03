"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadWorker = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const database_1 = require("../database");
const config_1 = require("./config");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const MAX_ATTEMPTS = 8;
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
/** Arquivo tocado há menos que isto pode ainda estar sendo gravado. */
const STILL_RECORDING_MS = 90000;
/**
 * Fila de upload das gravações para destinos remotos via rclone
 * (Google Drive, OneDrive, SMB, FTP...). A fila vive na tabela
 * recording_uploads (sobrevive a restart); backoff exponencial por tentativa
 * fica em memória — após um restart as pendências voltam imediatamente.
 */
class UploadWorker {
    constructor() {
        this.busy = false;
        this.nextAttemptAt = new Map(); // uploadId -> epoch ms
    }
    async tick() {
        if (this.busy)
            return;
        this.busy = true;
        try {
            const uploads = await database_1.prisma.recordingUpload.findMany({
                where: { status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS } },
                include: { segment: true, destination: true },
                orderBy: { createdAt: 'asc' },
                take: 5,
            });
            for (const upload of uploads) {
                if ((this.nextAttemptAt.get(upload.id) ?? 0) > Date.now())
                    continue;
                if (!upload.destination.enabled || !upload.destination.rcloneRemote)
                    continue;
                if (upload.segment.status === 'deleted_local') {
                    await database_1.prisma.recordingUpload.update({
                        where: { id: upload.id },
                        data: { status: 'failed', lastError: 'Arquivo local já foi removido', attempts: MAX_ATTEMPTS },
                    });
                    continue;
                }
                await this.uploadOne(upload);
            }
        }
        finally {
            this.busy = false;
        }
    }
    async uploadOne(upload) {
        const localFile = path_1.default.join(config_1.VMS_RECORDINGS_DIR, upload.segment.filePath);
        const base = (upload.destination.remoteBasePath || 'onliacesso-vms').replace(/\/+$/, '');
        const remote = `${upload.destination.rcloneRemote}:${base}/${upload.segment.filePath}`;
        // Se o arquivo foi tocado há segundos, a gravação dele ainda pode estar
        // rolando: o rclone abortaria no meio ("source file is being updated").
        // Deixa para o próximo ciclo, sem contar como falha.
        const st = await fs_1.promises.stat(localFile).catch(() => null);
        if (!st) {
            await database_1.prisma.recordingUpload.update({
                where: { id: upload.id },
                data: { status: 'failed', lastError: 'Arquivo não encontrado no disco', attempts: MAX_ATTEMPTS },
            });
            return;
        }
        if (Date.now() - st.mtimeMs < STILL_RECORDING_MS)
            return;
        await database_1.prisma.recordingUpload.update({ where: { id: upload.id }, data: { status: 'uploading' } });
        try {
            const args = ['copyto', localFile, remote, '--no-traverse'];
            if (config_1.RCLONE_CONFIG)
                args.push('--config', config_1.RCLONE_CONFIG);
            await execFileAsync(config_1.RCLONE_PATH, args, { timeout: UPLOAD_TIMEOUT_MS, windowsHide: true });
            await database_1.prisma.recordingUpload.update({
                where: { id: upload.id },
                data: { status: 'done', uploadedAt: new Date(), lastError: null },
            });
            this.nextAttemptAt.delete(upload.id);
            console.log(`[VMS] Upload concluído: ${upload.segment.filePath} → ${upload.destination.rcloneRemote}`);
            await this.maybeFreeLocalFile(upload.segment.id, localFile);
        }
        catch (err) {
            const attempts = upload.attempts + 1;
            const backoffMin = Math.min(2 ** attempts, 120); // 2,4,8...120 min
            this.nextAttemptAt.set(upload.id, Date.now() + backoffMin * 60000);
            await database_1.prisma.recordingUpload.update({
                where: { id: upload.id },
                data: { status: 'failed', attempts, lastError: String(err.message || err).slice(0, 1000) },
            });
            console.warn(`[VMS] Upload falhou (tentativa ${attempts}/${MAX_ATTEMPTS}): ${upload.segment.filePath} — ${err.message}`);
        }
    }
    /**
     * Modo "move": quando TODOS os destinos habilitados terminaram e pelo menos
     * um deles é move, o arquivo local é apagado para liberar disco.
     */
    async maybeFreeLocalFile(segmentId, localFile) {
        const uploads = await database_1.prisma.recordingUpload.findMany({
            where: { segmentId, destination: { enabled: true } },
            include: { destination: { select: { uploadMode: true } } },
        });
        if (uploads.length === 0)
            return;
        if (!uploads.every((u) => u.status === 'done'))
            return;
        if (!uploads.some((u) => u.destination.uploadMode === 'move'))
            return;
        try {
            await fs_1.promises.unlink(localFile);
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`[VMS] Falha ao liberar ${localFile}: ${err.message}`);
                return;
            }
        }
        await database_1.prisma.recordingSegment.update({
            where: { id: segmentId },
            data: { status: 'deleted_local' },
        });
        console.log(`[VMS] Arquivo local liberado após upload (modo move): ${localFile}`);
    }
}
exports.UploadWorker = UploadWorker;
