// Geometria das regras VCA. Tudo em coordenadas NORMALIZADAS 0–1 (resolução-
// independente): o operador desenha sobre a imagem e os pontos são salvos
// relativos, valendo para qualquer resolução de stream.

export type Point = [number, number];

/** Ponto dentro de polígono (ray casting). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = (yi > p[1]) !== (yj > p[1])
      && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Lado de um ponto em relação à reta orientada A→B (>0 esquerda, <0 direita). */
export function sideOfLine(a: Point, b: Point, p: Point): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

/** Os segmentos AB e CD se cruzam? */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = sideOfLine(c, d, a), d2 = sideOfLine(c, d, b);
  const d3 = sideOfLine(a, b, c), d4 = sideOfLine(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * Rastreamento leve de objetos entre frames (associação por vizinho mais
 * próximo do centroide). Usado para direção do cruzamento de linha: guarda a
 * posição anterior de cada trilha para saber de que lado veio.
 */
export interface Track {
  id: number;
  cx: number; cy: number;
  prevCx: number; prevCy: number;
  cls: number;
  lastSeen: number;
}

export class CentroidTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  constructor(private maxDist = 0.12, private ttlMs = 2000) {}

  update(dets: Array<{ cx: number; cy: number; cls: number }>, now: number): Track[] {
    // expira trilhas antigas
    this.tracks = this.tracks.filter((t) => now - t.lastSeen < this.ttlMs);
    const used = new Set<number>();
    for (const d of dets) {
      let best: Track | null = null, bestD = this.maxDist;
      for (const t of this.tracks) {
        if (used.has(t.id) || t.cls !== d.cls) continue;
        const dist = Math.hypot(t.cx - d.cx, t.cy - d.cy);
        if (dist < bestD) { bestD = dist; best = t; }
      }
      if (best) {
        best.prevCx = best.cx; best.prevCy = best.cy;
        best.cx = d.cx; best.cy = d.cy; best.lastSeen = now;
        used.add(best.id);
      } else {
        const t: Track = { id: this.nextId++, cx: d.cx, cy: d.cy, prevCx: d.cx, prevCy: d.cy, cls: d.cls, lastSeen: now };
        this.tracks.push(t); used.add(t.id);
      }
    }
    return this.tracks.filter((t) => used.has(t.id));
  }
}
