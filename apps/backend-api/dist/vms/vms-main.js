"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const fs_1 = require("fs");
const database_1 = require("../database");
const MediaMtxClient_1 = require("./MediaMtxClient");
const PathReconciler_1 = require("./PathReconciler");
const RecordingScheduler_1 = require("./RecordingScheduler");
const SegmentIndexer_1 = require("./SegmentIndexer");
const MotionWatcher_1 = require("./MotionWatcher");
const RetentionWorker_1 = require("./RetentionWorker");
const UploadWorker_1 = require("./UploadWorker");
const AudioTranscoder_1 = require("./AudioTranscoder");
const VcaEngine_1 = require("./vca/VcaEngine");
const config_1 = require("./config");
const rtsp_1 = require("./rtsp");
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
const mtx = new MediaMtxClient_1.MediaMtxClient();
const reconciler = new PathReconciler_1.PathReconciler(mtx);
const scheduler = new RecordingScheduler_1.RecordingScheduler(mtx);
const indexer = new SegmentIndexer_1.SegmentIndexer(scheduler);
const motionWatcher = new MotionWatcher_1.MotionWatcher(scheduler);
const retention = new RetentionWorker_1.RetentionWorker();
const uploader = new UploadWorker_1.UploadWorker();
const vca = new VcaEngine_1.VcaEngine(mtx, scheduler);
const audioTranscoder = new AudioTranscoder_1.AudioTranscoder(mtx);
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false })); // hooks do MediaMTX chegam via curl --data-urlencode
app.use('/internal', (req, res, next) => {
    if (config_1.VMS_INTERNAL_TOKEN && req.headers['x-vms-token'] !== config_1.VMS_INTERNAL_TOKEN) {
        res.status(401).json({ error: 'token interno inválido' });
        return;
    }
    next();
});
app.get('/internal/health', async (_req, res) => {
    res.json({ ok: true, mediamtx: await mtx.isUp() });
});
// Chamado pelo backend-api após mutações de CRUD de câmeras/gravação/storage
app.post('/internal/reload', async (_req, res) => {
    try {
        await reconciler.reconcile();
        scheduler.reset();
        await scheduler.tick();
        await motionWatcher.sync();
        await vca.reconcile();
        await audioTranscoder.reconcile();
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Gravação manual (botão REC do operador no painel/cloud)
app.post('/internal/manual-record', async (req, res) => {
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
        const channel = await database_1.prisma.videoChannel.findUnique({
            where: { id: channelId },
            include: { recording: true },
        });
        const recordPath = channel
            ? (channel.recording?.useSubStream ? (0, rtsp_1.subPathName)(channel.streamPath) : channel.streamPath)
            : null;
        // Se a gravação contínua/agendada segue ligada, o arquivo continua ABERTO —
        // não há clipe fechado para indexar; o app baixa a janela exata pelo
        // playback (campo `clip` abaixo).
        if (recordPath && !scheduler.isPathRecording(recordPath)) {
            await indexer.indexFreshForPath(channelId, recordPath);
        }
        const since = new Date((startedAt?.getTime() ?? Date.now() - 60000) - 10000);
        const segments = await database_1.prisma.recordingSegment.findMany({
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Canais gravando manualmente agora (a UI acende o botão REC)
app.get('/internal/manual-record', (_req, res) => {
    res.json({ channels: scheduler.manualChannels() });
});
// Hook runOnRecordSegmentComplete do MediaMTX (via curl)
app.post('/internal/segment-complete', async (req, res) => {
    const mtxPath = String(req.body.path || '');
    const file = String(req.body.file || '');
    if (!mtxPath || !file) {
        res.status(400).json({ error: 'path e file são obrigatórios' });
        return;
    }
    try {
        await indexer.handleSegmentComplete(mtxPath, file);
        res.json({ success: true });
    }
    catch (err) {
        console.error(`[VMS] Erro ao indexar segmento ${file}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});
function every(ms, fn, label) {
    let inFlight = false;
    setInterval(() => {
        if (inFlight)
            return;
        inFlight = true;
        fn()
            .catch((err) => console.error(`[VMS] ${label}: ${err.message}`))
            .finally(() => { inFlight = false; });
    }, ms);
}
async function main() {
    await fs_1.promises.mkdir(config_1.VMS_RECORDINGS_DIR, { recursive: true });
    app.listen(config_1.VMS_PORT, '127.0.0.1', () => {
        console.log(`[VMS] onliacesso-vms escutando em http://127.0.0.1:${config_1.VMS_PORT}`);
    });
    // espera o MediaMTX subir (serviço separado; ordem de boot não é garantida)
    for (let i = 0;; i++) {
        if (await mtx.isUp())
            break;
        if (i === 0)
            console.log(`[VMS] Aguardando MediaMTX em ${config_1.MEDIAMTX_API_URL}...`);
        await new Promise((r) => setTimeout(r, 5000));
    }
    console.log('[VMS] MediaMTX disponível');
    // O hook de fechamento de segmento é um script em disco (o MediaMTX não roda
    // comandos via shell) — regravado a cada boot para acompanhar token/porta.
    await (0, PathReconciler_1.ensureSegmentHookScript)();
    await reconciler.reconcile();
    await scheduler.tick();
    await motionWatcher.sync();
    await indexer.reconcileOrphans();
    await vca.reconcile().catch((err) => console.error(`[VCA] reconcile inicial: ${err.message}`));
    await audioTranscoder.reconcile().catch((err) => console.error(`[VMS] audio-transcoder reconcile inicial: ${err.message}`));
    every(60000, () => reconciler.reconcile(), 'reconcile');
    every(30000, () => scheduler.tick(), 'scheduler');
    every(60000, () => vca.reconcile(), 'vca');
    every(60000, () => audioTranscoder.reconcile(), 'audio-transcoder');
    // rede de segurança: indexa qualquer gravação que o hook do MediaMTX não
    // reportou (ele não dispara quando a gravação é interrompida no meio)
    every(5 * 60000, () => indexer.reconcileOrphans(), 'scan-gravacoes');
    every(60000, () => motionWatcher.sync(), 'motion-sync');
    every(60000, () => uploader.tick(), 'upload');
    every(60 * 60000, () => retention.run(), 'retention');
    void retention.run().catch((err) => console.error(`[VMS] retention: ${err.message}`));
}
void main().catch((err) => {
    console.error(`[VMS] Falha fatal na inicialização: ${err.message}`);
    process.exit(1);
});
