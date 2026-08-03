"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VCA_ENABLED = exports.VCA_MODEL_PATH = exports.VMS_RTSP_LOOPBACK = exports.VMS_BACKEND_API_URL = exports.VMS_ALWAYS_ON = exports.RCLONE_CONFIG = exports.RCLONE_PATH = exports.VMS_MIN_FREE_GB = exports.VMS_MAX_DISK_GB = exports.VMS_RECORDINGS_DIR = exports.MEDIAMTX_API_URL = exports.VMS_INTERNAL_TOKEN = exports.VMS_PORT = void 0;
const path_1 = __importDefault(require("path"));
// Configuração do vms-service — chaves gravadas no .env pelo install.ps1
// (componente opcional "Gerenciador de Imagens" do instalador).
exports.VMS_PORT = Number(process.env.VMS_PORT || 3011);
/** Token compartilhado entre backend-api, vms-service e hooks do MediaMTX. */
exports.VMS_INTERNAL_TOKEN = process.env.VMS_INTERNAL_TOKEN || '';
exports.MEDIAMTX_API_URL = (process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').replace(/\/+$/, '');
exports.VMS_RECORDINGS_DIR = process.env.VMS_RECORDINGS_DIR
    || path_1.default.join(process.cwd(), 'recordings');
/** 0 = sem teto de uso pelas gravações (só a retenção por dias de cada câmera). */
exports.VMS_MAX_DISK_GB = Number(process.env.VMS_MAX_DISK_GB || 0);
/**
 * Espaço livre mínimo que deve sobrar no volume das gravações. Abaixo disso o
 * RetentionWorker apaga os segmentos mais antigos; se ainda assim o livre cair
 * abaixo da metade, o RecordingScheduler PAUSA toda a gravação — encher o disco
 * derruba o MediaMTX e ameaça o PostgreSQL/Windows, não só o VMS.
 */
exports.VMS_MIN_FREE_GB = Number(process.env.VMS_MIN_FREE_GB || 10);
exports.RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
exports.RCLONE_CONFIG = process.env.RCLONE_CONFIG || '';
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
exports.VMS_ALWAYS_ON = (process.env.VMS_ALWAYS_ON || 'true').toLowerCase() !== 'false';
/** Base do backend-api para repassar eventos (motion → SSE via emitEvent). */
exports.VMS_BACKEND_API_URL = (process.env.VMS_BACKEND_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
// ── VCA por software (análise de vídeo no servidor) ──────────────────────────
/** RTSP loopback do MediaMTX (a análise consome os paths locais daqui). */
exports.VMS_RTSP_LOOPBACK = (process.env.VMS_RTSP_LOOPBACK || 'rtsp://127.0.0.1:8554').replace(/\/+$/, '');
/** Caminho do modelo YOLO (.onnx). Vazio/ausente = VCA fica inativo. */
exports.VCA_MODEL_PATH = process.env.VCA_MODEL_PATH || '';
/** Liga o motor de VCA por software (além do modelo existir e do canal optar). */
exports.VCA_ENABLED = (process.env.VCA_ENABLED || 'true').toLowerCase() !== 'false';
