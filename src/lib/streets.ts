import type { LatLng } from "./config";
import type { Line } from "./geo";

// Utilidades para recortar una calle a una sola cuadra (entre dos cruces).
// Se trabaja en metros con una proyección local: basta a escala de colonia.

type XY = [number, number];
const M = 111_320;

function projector(refLat: number) {
  const kx = M * Math.cos((refLat * Math.PI) / 180);
  return {
    to: ([lng, lat]: [number, number]): XY => [lng * kx, lat * M],
    from: ([x, y]: XY): [number, number] => [x / kx, y / M],
  };
}

const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Proyección de p sobre el segmento ab: parámetro t (0..1) y distancia. */
function projectOnSegment(p: XY, a: XY, b: XY) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: XY = [a[0] + t * dx, a[1] + t * dy];
  return { t, q, d: dist(p, q) };
}

/** Une tramos que comparten extremo (las calles vienen cortadas por mosaico). */
export function mergeLines(lines: XY[][], tolerance = 1): XY[][] {
  const pool = lines.filter((l) => l.length >= 2).map((l) => [...l]);
  const out: XY[][] = [];
  while (pool.length) {
    let line = pool.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const other = pool[i];
        const [head, tail] = [line[0], line[line.length - 1]];
        const [oHead, oTail] = [other[0], other[other.length - 1]];
        let joined: XY[] | null = null;
        if (dist(tail, oHead) <= tolerance) joined = [...line, ...other.slice(1)];
        else if (dist(tail, oTail) <= tolerance) joined = [...line, ...[...other].reverse().slice(1)];
        else if (dist(head, oTail) <= tolerance) joined = [...other, ...line.slice(1)];
        else if (dist(head, oHead) <= tolerance) joined = [...[...other].reverse(), ...line.slice(1)];
        if (joined) {
          line = joined;
          pool.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Camina desde `start` (en el segmento `index`) en una dirección hasta el primer
 * cruce: un vértice de otra calle a menos de `tolerance` metros del recorrido.
 */
function walk(line: XY[], index: number, start: XY, dir: 1 | -1, cross: XY[], tolerance: number): XY[] {
  const out: XY[] = [];
  let from = start;
  for (let i = dir === 1 ? index + 1 : index; i >= 0 && i < line.length; i += dir) {
    const to = line[i];
    // Cruce más cercano a `from` dentro de este segmento (ignorando el punto de partida).
    let hit: XY | null = null;
    let hitT = Infinity;
    for (const v of cross) {
      const { t, q, d } = projectOnSegment(v, from, to);
      if (d <= tolerance && dist(q, start) > tolerance && t < hitT) [hit, hitT] = [q, t];
    }
    if (hit) {
      out.push(hit);
      return out;
    }
    out.push(to);
    from = to;
  }
  return out;
}

export type BlockOptions = { tolerance?: number };

/**
 * Devuelve la cuadra de la calle donde se tocó: el tramo entre los dos cruces
 * más cercanos con otras calles. Si no hay cruces, el tramo hasta los extremos.
 */
export function blockAround(tap: LatLng, street: Line[], others: Line[], { tolerance = 3 }: BlockOptions = {}): Line | null {
  if (street.length === 0) return null;
  const proj = projector(tap[0]);
  const p = proj.to([tap[1], tap[0]]);
  const lines = mergeLines(street.map((l) => l.map(proj.to)));
  const cross = others.flat().map(proj.to);

  // Segmento más cercano al toque.
  let best: { line: XY[]; index: number; q: XY; d: number } | null = null;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const { q, d } = projectOnSegment(p, line[i], line[i + 1]);
      if (!best || d < best.d) best = { line, index: i, q, d };
    }
  }
  if (!best) return null;

  const forward = walk(best.line, best.index, best.q, 1, cross, tolerance);
  const backward = walk(best.line, best.index, best.q, -1, cross, tolerance);
  const block = [...backward.reverse(), best.q, ...forward].filter(
    (pt, i, arr) => i === 0 || dist(pt, arr[i - 1]) > 0.01,
  );
  return block.length >= 2 ? block.map(proj.from) : null;
}

/** ¿La línea corre sobre la calle (la mayoría de sus vértices pegados a ella)? */
export function overlaps(line: Line, street: Line[], tolerance = 3): boolean {
  if (line.length === 0) return false;
  const proj = projector(line[0][1]);
  const segs = street.map((l) => l.map(proj.to));
  const near = line.filter((pt) => {
    const p = proj.to(pt);
    return segs.some((s) => s.some((_, i) => i > 0 && projectOnSegment(p, s[i - 1], s[i]).d <= tolerance));
  });
  return near.length / line.length >= 0.8;
}
