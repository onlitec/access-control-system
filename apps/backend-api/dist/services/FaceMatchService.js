"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaceMatchService = void 0;
const path_1 = __importDefault(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
// Build alternativo do @vladmandic/face-api que roda sobre @tensorflow/tfjs
// (backend WASM) em vez de @tensorflow/tfjs-node. O binding nativo do
// tfjs-node exige compilação (node-gyp/Visual Studio) no Windows quando não
// há prebuilt para a versão exata do Node empacotada no instalador — testado
// e confirmado que falha nessa combinação. O build node-wasm não tem
// dependência nativa nenhuma além do `canvas` (que tem prebuilt disponível).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Canvas, Image, ImageData, loadImage } = require('canvas');
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const MODEL_PATH = path_1.default.join(require.resolve('@vladmandic/face-api/package.json'), '..', 'model');
const DEFAULT_THRESHOLD = 0.55; // distância euclidiana; menor = mais parecido
const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || DEFAULT_THRESHOLD;
let modelsReady = null;
async function ensureModelsLoaded() {
    if (!modelsReady) {
        modelsReady = (async () => {
            await faceapi.tf.setBackend('wasm');
            await faceapi.tf.ready();
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
            console.log('[FaceMatch] Modelos carregados (backend:', faceapi.tf.getBackend(), ')');
        })();
    }
    return modelsReady;
}
/**
 * Decodifica uma imagem a partir de:
 * - data URL base64 (data:image/jpeg;base64,...) — formato usado hoje em Person.photoUrl
 * - URL http(s) (ex.: proxy do HikCentral) — busca via fetch
 */
async function decodeImage(source) {
    if (source.startsWith('data:')) {
        const base64 = source.split(',')[1] || '';
        const buffer = Buffer.from(base64, 'base64');
        return loadImage(buffer);
    }
    if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/')) {
        const res = await (0, node_fetch_1.default)(source);
        if (!res.ok)
            throw new Error(`Falha ao buscar imagem de referência (HTTP ${res.status})`);
        const buffer = Buffer.from(await res.arrayBuffer());
        return loadImage(buffer);
    }
    // assume base64 puro sem prefixo data:
    return loadImage(Buffer.from(source, 'base64'));
}
class FaceMatchService {
    /**
     * Compara a foto de referência do morador (Person.photoUrl) com a selfie
     * capturada no onboarding. Retorna a distância euclidiana entre os
     * descritores faciais (128 dimensões) e se está dentro do threshold.
     */
    static async compareFaces(referencePhoto, candidatePhoto) {
        await ensureModelsLoaded();
        const [refImg, candImg] = await Promise.all([
            decodeImage(referencePhoto),
            decodeImage(candidatePhoto),
        ]);
        const [refResult, candResult] = await Promise.all([
            faceapi.detectSingleFace(refImg).withFaceLandmarks().withFaceDescriptor(),
            faceapi.detectSingleFace(candImg).withFaceLandmarks().withFaceDescriptor(),
        ]);
        if (!refResult) {
            return { match: false, similarity: Infinity, noFaceDetected: 'reference' };
        }
        if (!candResult) {
            return { match: false, similarity: Infinity, noFaceDetected: 'candidate' };
        }
        const distance = faceapi.euclideanDistance(refResult.descriptor, candResult.descriptor);
        return { match: distance <= FACE_MATCH_THRESHOLD, similarity: distance };
    }
}
exports.FaceMatchService = FaceMatchService;
