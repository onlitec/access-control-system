"use strict";
// Geometria das regras VCA. Tudo em coordenadas NORMALIZADAS 0–1 (resolução-
// independente): o operador desenha sobre a imagem e os pontos são salvos
// relativos, valendo para qualquer resolução de stream.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CentroidTracker = void 0;
exports.pointInPolygon = pointInPolygon;
exports.sideOfLine = sideOfLine;
exports.segmentsIntersect = segmentsIntersect;
/** Ponto dentro de polígono (ray casting). */
function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        const intersect = (yi > p[1]) !== (yj > p[1])
            && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
/** Lado de um ponto em relação à reta orientada A→B (>0 esquerda, <0 direita). */
function sideOfLine(a, b, p) {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}
/** Os segmentos AB e CD se cruzam? */
function segmentsIntersect(a, b, c, d) {
    const d1 = sideOfLine(c, d, a), d2 = sideOfLine(c, d, b);
    const d3 = sideOfLine(a, b, c), d4 = sideOfLine(a, b, d);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
class CentroidTracker {
    constructor(maxDist = 0.12, ttlMs = 2000) {
        this.maxDist = maxDist;
        this.ttlMs = ttlMs;
        this.tracks = [];
        this.nextId = 1;
    }
    update(dets, now) {
        // expira trilhas antigas
        this.tracks = this.tracks.filter((t) => now - t.lastSeen < this.ttlMs);
        const used = new Set();
        for (const d of dets) {
            let best = null, bestD = this.maxDist;
            for (const t of this.tracks) {
                if (used.has(t.id) || t.cls !== d.cls)
                    continue;
                const dist = Math.hypot(t.cx - d.cx, t.cy - d.cy);
                if (dist < bestD) {
                    bestD = dist;
                    best = t;
                }
            }
            if (best) {
                best.prevCx = best.cx;
                best.prevCy = best.cy;
                best.cx = d.cx;
                best.cy = d.cy;
                best.lastSeen = now;
                used.add(best.id);
            }
            else {
                const t = { id: this.nextId++, cx: d.cx, cy: d.cy, prevCx: d.cx, prevCy: d.cy, cls: d.cls, lastSeen: now };
                this.tracks.push(t);
                used.add(t.id);
            }
        }
        return this.tracks.filter((t) => used.has(t.id));
    }
}
exports.CentroidTracker = CentroidTracker;
