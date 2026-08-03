"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VEHICLE_CLASSES = exports.COCO_CLASSES = void 0;
exports.classNamesToIds = classNamesToIds;
exports.parseClassConfig = parseClassConfig;
/**
 * Classes do dataset COCO (ordem do YOLOv8). O índice é o id que o modelo
 * devolve; o VCA filtra pelas classes que interessam a cada câmera.
 */
exports.COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
    'hair drier', 'toothbrush',
];
/** Classes de "veículo" — atalho útil na configuração ("pessoa e veículos"). */
exports.VEHICLE_CLASSES = ['bicycle', 'car', 'motorcycle', 'bus', 'truck'];
/** Nomes → ids, para converter a lista `classes` da config em índices. */
function classNamesToIds(names) {
    const wanted = names && names.length > 0 ? names : ['person'];
    const ids = new Set();
    for (const n of wanted) {
        const i = exports.COCO_CLASSES.indexOf(n);
        if (i >= 0)
            ids.add(i);
    }
    return ids;
}
/**
 * Aceita `classes` no formato antigo (lista de strings) ou no novo (itens
 * podem ser `{name, minScore}` para dar um limiar específico por classe,
 * ex.: pessoa exige mais confiança que carro na mesma câmera). Formato misto
 * é permitido.
 */
function parseClassConfig(raw) {
    const list = Array.isArray(raw) && raw.length > 0 ? raw : ['person'];
    const names = [];
    const thresholds = new Map(); // nome da classe → minScore específico
    for (const item of list) {
        if (typeof item === 'string') {
            names.push(item);
        }
        else if (item && typeof item === 'object' && typeof item.name === 'string') {
            names.push(item.name);
            if (typeof item.minScore === 'number')
                thresholds.set(item.name, item.minScore);
        }
    }
    return { names, thresholds };
}
