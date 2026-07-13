import path from 'path';

// Configuração do vms-service — chaves gravadas no .env pelo install.ps1
// (componente opcional "Gerenciador de Imagens" do instalador).

export const VMS_PORT = Number(process.env.VMS_PORT || 3011);

/** Token compartilhado entre backend-api, vms-service e hooks do MediaMTX. */
export const VMS_INTERNAL_TOKEN = process.env.VMS_INTERNAL_TOKEN || '';

export const MEDIAMTX_API_URL = (process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').replace(/\/+$/, '');

export const VMS_RECORDINGS_DIR = process.env.VMS_RECORDINGS_DIR
  || path.join(process.cwd(), 'recordings');

/** 0 = sem teto de uso pelas gravações (só a retenção por dias de cada câmera). */
export const VMS_MAX_DISK_GB = Number(process.env.VMS_MAX_DISK_GB || 0);

/**
 * Espaço livre mínimo que deve sobrar no volume das gravações. Abaixo disso o
 * RetentionWorker apaga os segmentos mais antigos; se ainda assim o livre cair
 * abaixo da metade, o RecordingScheduler PAUSA toda a gravação — encher o disco
 * derruba o MediaMTX e ameaça o PostgreSQL/Windows, não só o VMS.
 */
export const VMS_MIN_FREE_GB = Number(process.env.VMS_MIN_FREE_GB || 10);

export const RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
export const RCLONE_CONFIG = process.env.RCLONE_CONFIG || '';

/**
 * Mantém a conexão RTSP com as câmeras SEMPRE aberta (como um NVR), em vez de
 * conectar só quando alguém abre o stream. Sem isto, cada vez que o app é
 * aberto o servidor precisa conectar na câmera e esperar um keyframe — são os
 * segundos de tela preta que o operador vê.
 *
 * Custo: banda constante câmera→servidor na LAN (~1-2 Mbps por sub-stream).
 * Em instalações com dezenas de câmeras e rede fraca, desligue com
 * VMS_ALWAYS_ON=false.
 */
export const VMS_ALWAYS_ON = (process.env.VMS_ALWAYS_ON || 'true').toLowerCase() !== 'false';

/** Base do backend-api para repassar eventos (motion → SSE via emitEvent). */
export const VMS_BACKEND_API_URL = (process.env.VMS_BACKEND_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

// ── VCA por software (análise de vídeo no servidor) ──────────────────────────

/** RTSP loopback do MediaMTX (a análise consome os paths locais daqui). */
export const VMS_RTSP_LOOPBACK = (process.env.VMS_RTSP_LOOPBACK || 'rtsp://127.0.0.1:8554').replace(/\/+$/, '');

/** Caminho do modelo YOLO (.onnx). Vazio/ausente = VCA fica inativo. */
export const VCA_MODEL_PATH = process.env.VCA_MODEL_PATH || '';

/** Liga o motor de VCA por software (além do modelo existir e do canal optar). */
export const VCA_ENABLED = (process.env.VCA_ENABLED || 'true').toLowerCase() !== 'false';
