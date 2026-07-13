/**
 * Classes do dataset COCO (ordem do YOLOv8). O índice é o id que o modelo
 * devolve; o VCA filtra pelas classes que interessam a cada câmera.
 */
export const COCO_CLASSES = [
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
] as const;

/** Classes de "veículo" — atalho útil na configuração ("pessoa e veículos"). */
export const VEHICLE_CLASSES = ['bicycle', 'car', 'motorcycle', 'bus', 'truck'];

/** Nomes → ids, para converter a lista `classes` da config em índices. */
export function classNamesToIds(names: string[] | null | undefined): Set<number> {
  const wanted = names && names.length > 0 ? names : ['person'];
  const ids = new Set<number>();
  for (const n of wanted) {
    const i = COCO_CLASSES.indexOf(n as any);
    if (i >= 0) ids.add(i);
  }
  return ids;
}
