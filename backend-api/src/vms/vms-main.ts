import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import { prisma } from '../database';
import { MediaMtxClient } from './MediaMtxClient';
import { PathReconciler, ensureSegmentHookScript } from './PathReconciler';
import { RecordingScheduler } from './RecordingScheduler';
import { SegmentIndexer } from './SegmentIndexer';
import { MotionWatcher } from './MotionWatcher';
import { RetentionWorker } from './RetentionWorker';
import { UploadWorker } from './UploadWorker';
import { VcaEngine } from './vca/VcaEngine';
import { VMS_PORT, VMS_INTERNAL_TOKEN, VMS_RECORDINGS_DIR, MEDIAMTX_API_URL } from './config';
import { subPathName } from './rtsp';

/**
 * onliacesso-vms — orquestrador do módulo de câmeras (VMS).
 * Processo separado do backend-api (serviço Windows próprio): sincroniza os
 * paths do MediaMTX com o banco, liga/desliga gravação por canal, indexa os
 * segmentos gravados, escuta eventos de movimento (ISAPI) e faz upload das
 * gravações para destinos remotos via rclone.
 *
 * Só escuta em 127.0.0.1; o backend-api e os hooks do MediaMTX autenticam
 * com o header x-vms-token (VMS_INTERNAL_TOKEN do .env).
 */

const mtx = new MediaMtxClient();
const reconciler = new PathReconciler(mtx);
const scheduler = new RecordingScheduler(mtx);
const indexer = new SegmentIndexer(scheduler);
const motionWatcher = new MotionWatcher(scheduler);
const retention = new RetentionWorker();
const uploader = new UploadWorker();
const vca = new VcaEngine(mtx, scheduler);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // hooks do MediaMTX chegam via curl --data-urlencode

app.use('/internal', (req: Request, res: Response, next: NextFunction): void => {
  if (VMS_INTERNAL_TOKEN && req.headers['x-vms-token'] !== VMS_INTERNAL_TOKEN) {
    res.status(401).json({ error: 'token interno inválido' });
    return;
  }
  next();
});

app.get('/internal/health', async (_req: Request, res: Response) => {
  res.json({ ok: true, mediamtx: await mtx.isUp() });
});

// Chamado pelo backend-api após mutações de CRUD de câmeras/gravação/storage
app.post('/internal/reload', async (_req: Request, res: Response) => {
  try {
    await reconciler.reconcile();
    scheduler.reset();
    await scheduler.tick();
    await motionWatcher.sync();
    await vca.reconcile();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gravação manual (botão REC do operador no painel/cloud)
app.post('/internal/manual-record', async (req: Request, res: Response) => {
  const channelId = String(req.body.channelId || '');
  const active = req.body.active === true || req.body.active === 'true';
  if (!channelId) {
    res.status(400).json({ error: 'channelId é obrigatório' });
    return;
  }
  try {
    const startedAt = scheduler.manualStart(channelId);
    scheduler.setManual(channelId, active);
    await scheduler.tick(); // aplica na hora, sem esperar o próximo ciclo
    console.log(`[VMS] Gravação manual ${active ? 'INICIADA' : 'encerrada'} no canal ${channelId}`);

    if (active) {
      res.json({ success: true, recording: true, segments: [] });
      return;
    }

    // Ao PARAR: o MediaMTX leva um instante para fechar o arquivo e NÃO dispara
    // o hook de segmento completo (ele só dispara na rotação). Esperamos o
    // arquivo assentar e indexamos o clipe recém-fechado DIRETO — o scan geral
    // (reconcileOrphans) não serve aqui: ele pula arquivos com menos de 90s por
    // presumir gravação em andamento, e o clipe manual sempre é mais novo que
    // isso, então nunca era indexado e o app não tinha o que baixar.
    await new Promise((r) => setTimeout(r, 2500));

    const channel = await prisma.videoChannel.findUnique({
      where: { id: channelId },
      include: { recording: true },
    });
    const recordPath = channel
      ? (channel.recording?.useSubStream ? subPathName(channel.streamPath) : channel.streamPath)
      : null;
    // Se a gravação contínua/agendada segue ligada, o arquivo continua ABERTO —
    // não há clipe fechado para indexar; o app baixa a janela exata pelo
    // playback (campo `clip` abaixo).
    if (recordPath && !scheduler.isPathRecording(recordPath)) {
      await indexer.indexFreshForPath(channelId, recordPath);
    }

    const since = new Date((startedAt?.getTime() ?? Date.now() - 60_000) - 10_000);
    const segments = await prisma.recordingSegment.findMany({
      where: { channelId, startedAt: { gte: since }, status: 'closed' },
      orderBy: { startedAt: 'asc' },
      select: { id: true, filePath: true, sizeBytes: true, startedAt: true },
    });

    res.json({
      success: true,
      recording: false,
      segments: segments.map((s) => ({ ...s, sizeBytes: Number(s.sizeBytes) })),
      // janela exata da gravação manual: quando não há arquivo fechado (canal
      // em gravação contínua), o app baixa este trecho por /vms/playback/stream
      clip: startedAt
        ? { start: startedAt.toISOString(), duration: Math.max(2, Math.ceil((Date.now() - startedAt.getTime()) / 1000)) }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Canais gravando manualmente agora (a UI acende o botão REC)
app.get('/internal/manual-record', (_req: Request, res: Response) => {
  res.json({ channels: scheduler.manualChannels() });
});

// Hook runOnRecordSegmentComplete do MediaMTX (via curl)
app.post('/internal/segment-complete', async (req: Request, res: Response) => {
  const mtxPath = String(req.body.path || '');
  const file = String(req.body.file || '');
  if (!mtxPath || !file) {
    res.status(400).json({ error: 'path e file são obrigatórios' });
    return;
  }
  try {
    await indexer.handleSegmentComplete(mtxPath, file);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[VMS] Erro ao indexar segmento ${file}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

function every(ms: number, fn: () => Promise<void>, label: string): void {
  let inFlight = false;
  setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    fn()
      .catch((err) => console.error(`[VMS] ${label}: ${err.message}`))
      .finally(() => { inFlight = false; });
  }, ms);
}

async function main(): Promise<void> {
  await fs.mkdir(VMS_RECORDINGS_DIR, { recursive: true });

  app.listen(VMS_PORT, '127.0.0.1', () => {
    console.log(`[VMS] onliacesso-vms escutando em http://127.0.0.1:${VMS_PORT}`);
  });

  // espera o MediaMTX subir (serviço separado; ordem de boot não é garantida)
  for (let i = 0; ; i++) {
    if (await mtx.isUp()) break;
    if (i === 0) console.log(`[VMS] Aguardando MediaMTX em ${MEDIAMTX_API_URL}...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('[VMS] MediaMTX disponível');

  // O hook de fechamento de segmento é um script em disco (o MediaMTX não roda
  // comandos via shell) — regravado a cada boot para acompanhar token/porta.
  await ensureSegmentHookScript();

  await reconciler.reconcile();
  await scheduler.tick();
  await motionWatcher.sync();
  await indexer.reconcileOrphans();
  await vca.reconcile().catch((err) => console.error(`[VCA] reconcile inicial: ${err.message}`));

  every(60_000, () => reconciler.reconcile(), 'reconcile');
  every(30_000, () => scheduler.tick(), 'scheduler');
  every(60_000, () => vca.reconcile(), 'vca');
  // rede de segurança: indexa qualquer gravação que o hook do MediaMTX não
  // reportou (ele não dispara quando a gravação é interrompida no meio)
  every(5 * 60_000, () => indexer.reconcileOrphans(), 'scan-gravacoes');
  every(60_000, () => motionWatcher.sync(), 'motion-sync');
  every(60_000, () => uploader.tick(), 'upload');
  every(60 * 60_000, () => retention.run(), 'retention');
  void retention.run().catch((err) => console.error(`[VMS] retention: ${err.message}`));
}

void main().catch((err) => {
  console.error(`[VMS] Falha fatal na inicialização: ${err.message}`);
  process.exit(1);
});
