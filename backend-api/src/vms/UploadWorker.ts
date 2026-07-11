import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../database';
import { VMS_RECORDINGS_DIR, RCLONE_PATH, RCLONE_CONFIG } from './config';

const execFileAsync = promisify(execFile);

const MAX_ATTEMPTS = 8;
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** Arquivo tocado há menos que isto pode ainda estar sendo gravado. */
const STILL_RECORDING_MS = 90_000;

/**
 * Fila de upload das gravações para destinos remotos via rclone
 * (Google Drive, OneDrive, SMB, FTP...). A fila vive na tabela
 * recording_uploads (sobrevive a restart); backoff exponencial por tentativa
 * fica em memória — após um restart as pendências voltam imediatamente.
 */
export class UploadWorker {
  private busy = false;
  private nextAttemptAt = new Map<string, number>(); // uploadId -> epoch ms

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const uploads = await prisma.recordingUpload.findMany({
        where: { status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS } },
        include: { segment: true, destination: true },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });

      for (const upload of uploads) {
        if ((this.nextAttemptAt.get(upload.id) ?? 0) > Date.now()) continue;
        if (!upload.destination.enabled || !upload.destination.rcloneRemote) continue;

        if (upload.segment.status === 'deleted_local') {
          await prisma.recordingUpload.update({
            where: { id: upload.id },
            data: { status: 'failed', lastError: 'Arquivo local já foi removido', attempts: MAX_ATTEMPTS },
          });
          continue;
        }

        await this.uploadOne(upload);
      }
    } finally {
      this.busy = false;
    }
  }

  private async uploadOne(upload: {
    id: string;
    attempts: number;
    segment: { id: string; filePath: string };
    destination: { rcloneRemote: string | null; remoteBasePath: string | null; uploadMode: string };
  }): Promise<void> {
    const localFile = path.join(VMS_RECORDINGS_DIR, upload.segment.filePath);
    const base = (upload.destination.remoteBasePath || 'onliacesso-vms').replace(/\/+$/, '');
    const remote = `${upload.destination.rcloneRemote}:${base}/${upload.segment.filePath}`;

    // Se o arquivo foi tocado há segundos, a gravação dele ainda pode estar
    // rolando: o rclone abortaria no meio ("source file is being updated").
    // Deixa para o próximo ciclo, sem contar como falha.
    const st = await fs.stat(localFile).catch(() => null);
    if (!st) {
      await prisma.recordingUpload.update({
        where: { id: upload.id },
        data: { status: 'failed', lastError: 'Arquivo não encontrado no disco', attempts: MAX_ATTEMPTS },
      });
      return;
    }
    if (Date.now() - st.mtimeMs < STILL_RECORDING_MS) return;

    await prisma.recordingUpload.update({ where: { id: upload.id }, data: { status: 'uploading' } });

    try {
      const args = ['copyto', localFile, remote, '--no-traverse'];
      if (RCLONE_CONFIG) args.push('--config', RCLONE_CONFIG);
      await execFileAsync(RCLONE_PATH, args, { timeout: UPLOAD_TIMEOUT_MS, windowsHide: true });

      await prisma.recordingUpload.update({
        where: { id: upload.id },
        data: { status: 'done', uploadedAt: new Date(), lastError: null },
      });
      this.nextAttemptAt.delete(upload.id);
      console.log(`[VMS] Upload concluído: ${upload.segment.filePath} → ${upload.destination.rcloneRemote}`);

      await this.maybeFreeLocalFile(upload.segment.id, localFile);
    } catch (err: any) {
      const attempts = upload.attempts + 1;
      const backoffMin = Math.min(2 ** attempts, 120); // 2,4,8...120 min
      this.nextAttemptAt.set(upload.id, Date.now() + backoffMin * 60_000);
      await prisma.recordingUpload.update({
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
  private async maybeFreeLocalFile(segmentId: string, localFile: string): Promise<void> {
    const uploads = await prisma.recordingUpload.findMany({
      where: { segmentId, destination: { enabled: true } },
      include: { destination: { select: { uploadMode: true } } },
    });
    if (uploads.length === 0) return;
    if (!uploads.every((u) => u.status === 'done')) return;
    if (!uploads.some((u) => u.destination.uploadMode === 'move')) return;

    try {
      await fs.unlink(localFile);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`[VMS] Falha ao liberar ${localFile}: ${err.message}`);
        return;
      }
    }
    await prisma.recordingSegment.update({
      where: { id: segmentId },
      data: { status: 'deleted_local' },
    });
    console.log(`[VMS] Arquivo local liberado após upload (modo move): ${localFile}`);
  }
}
