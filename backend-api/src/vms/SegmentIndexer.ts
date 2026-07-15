import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../database';
import { VMS_RECORDINGS_DIR } from './config';
import { RecordingScheduler } from './RecordingScheduler';

/** `cam-x-sub` e `cam-x` são o mesmo canal (streamPath = `cam-x`). */
function channelPathOf(mtxPath: string): string {
  return mtxPath.endsWith('-sub') ? mtxPath.slice(0, -4) : mtxPath;
}

/**
 * Um arquivo tocado há poucos segundos provavelmente AINDA ESTÁ SENDO GRAVADO.
 * Indexá-lo como "fechado" faria o upload tentar enviar um arquivo que cresce
 * durante a transferência — o rclone aborta com "source file is being updated".
 */
const STILL_RECORDING_MS = 90_000;

function isProbablyOpen(mtimeMs: number): boolean {
  return Date.now() - mtimeMs < STILL_RECORDING_MS;
}

/** Extrai o início da gravação do nome `%Y-%m-%d_%H-%M-%S-%f.mp4` (hora local). */
function parseStartFromFilename(fileName: string): Date | null {
  const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, s);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Indexa os segmentos fMP4 gravados pelo MediaMTX na tabela recording_segments
 * e enfileira o upload para os destinos remotos habilitados. Alimentado pelo
 * hook runOnRecordSegmentComplete; o scan de boot cobre segmentos gravados
 * enquanto o vms-service estava fora do ar.
 */
export class SegmentIndexer {
  constructor(private scheduler: RecordingScheduler) {}

  async handleSegmentComplete(mtxPath: string, absFile: string): Promise<void> {
    const channel = await prisma.videoChannel.findUnique({
      where: { streamPath: channelPathOf(mtxPath) },
    });
    if (!channel) {
      console.warn(`[VMS] Segmento de path desconhecido ignorado: ${mtxPath}`);
      return;
    }
    await this.indexFile(channel.id, absFile, this.scheduler.triggerForPath(mtxPath));
  }

  private async indexFile(channelId: string, absFile: string, trigger: string): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(absFile);
    } catch {
      console.warn(`[VMS] Segmento não encontrado no disco: ${absFile}`);
      return;
    }

    const relPath = path.relative(VMS_RECORDINGS_DIR, absFile).split(path.sep).join('/');
    const startedAt = parseStartFromFilename(path.basename(absFile)) ?? stat.birthtime;

    const segment = await prisma.recordingSegment.upsert({
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

    const destinations = await prisma.storageDestination.findMany({
      where: { enabled: true, kind: 'rclone' },
      select: { id: true },
    });
    if (destinations.length > 0) {
      await prisma.recordingUpload.createMany({
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
  async indexFreshForPath(channelId: string, pathName: string): Promise<void> {
    const files = await this.walkMp4(path.join(VMS_RECORDINGS_DIR, pathName));
    if (files.length === 0) return;

    const known = new Set(
      (await prisma.recordingSegment.findMany({
        where: { channelId },
        select: { filePath: true },
      })).map((s) => s.filePath),
    );

    for (const absFile of files) {
      const relPath = path.relative(VMS_RECORDINGS_DIR, absFile).split(path.sep).join('/');
      if (known.has(relPath)) continue;
      await this.indexFile(channelId, absFile, 'manual');
      console.log(`[VMS] Clipe manual indexado: ${relPath}`);
    }
  }

  /**
   * Scan de reconciliação: percorre VMS_RECORDINGS_DIR e indexa arquivos .mp4
   * que não estão no banco (o primeiro nível de diretório é o path MediaMTX).
   */
  async reconcileOrphans(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(VMS_RECORDINGS_DIR);
    } catch {
      return; // diretório ainda não existe — nada gravado
    }

    const known = new Set(
      (await prisma.recordingSegment.findMany({ select: { filePath: true } })).map((s) => s.filePath),
    );

    for (const dir of entries) {
      const channelDir = path.join(VMS_RECORDINGS_DIR, dir);
      const st = await fs.stat(channelDir).catch(() => null);
      if (!st?.isDirectory()) continue;

      const channel = await prisma.videoChannel.findUnique({ where: { streamPath: channelPathOf(dir) } });
      if (!channel) continue;

      const files = await this.walkMp4(channelDir);
      for (const absFile of files) {
        const relPath = path.relative(VMS_RECORDINGS_DIR, absFile).split(path.sep).join('/');
        if (known.has(relPath)) continue;

        // o arquivo da gravação EM ANDAMENTO ainda está crescendo — indexá-lo
        // agora faria o upload tentar enviar um arquivo em movimento
        const st = await fs.stat(absFile).catch(() => null);
        if (!st || isProbablyOpen(st.mtimeMs)) continue;

        // usa o motivo real da gravação daquele path (manual, motion, agenda...)
        await this.indexFile(channel.id, absFile, this.scheduler.triggerForPath(dir));
        console.log(`[VMS] Segmento órfão indexado: ${relPath}`);
      }
    }
  }

  private async walkMp4(dir: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...await this.walkMp4(full));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.mp4')) {
        out.push(full);
      }
    }
    return out;
  }
}
