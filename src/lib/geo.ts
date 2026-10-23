import type { LatLng } from "./config";

/** Ray casting: indica si el punto cae dentro del polígono (lat/lng). */
export function isPointInPolygon([lat, lng]: LatLng, polygon: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const crosses = latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Caja que contiene el polígono, con un margen relativo. */
export function paddedBounds(polygon: readonly LatLng[], ratio = 0.5): [LatLng, LatLng] {
  const lats = polygon.map((p) => p[0]);
  const lngs = polygon.map((p) => p[1]);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const dLat = (maxLat - minLat) * ratio;
  const dLng = (maxLng - minLng) * ratio;
  return [
    [minLat - dLat, minLng - dLng],
    [maxLat + dLat, maxLng + dLng],
  ];
}

/** Línea en coordenadas [lng, lat], como en GeoJSON. */
export type Line = [lng: number, lat: number][];

const METERS_PER_DEG_LAT = 111_320;

/** Proyección local en metros, suficiente para distancias dentro de una colonia. */
function toMeters([lng, lat]: [number, number], refLat: number): [number, number] {
  return [lng * METERS_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180), lat * METERS_PER_DEG_LAT];
}

function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distancia en metros de un punto [lat, lng] a una línea. */
export function distanceToLine([lat, lng]: LatLng, line: Line): number {
  const p = toMeters([lng, lat], lat);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, toMeters(line[i - 1], lat), toMeters(line[i], lat)));
  }
  return best;
}

/** Longitud total en metros. */
export function pathLength(lines: Line[]): number {
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ref = line[i][1];
      const [a, b] = [toMeters(line[i - 1], ref), toMeters(line[i], ref)];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  return total;
}

/**
 * Recorta líneas al polígono: conserva los tramos de vértices consecutivos que
 * caen dentro. Quita duplicados (las calles se repiten en varios mosaicos).
 */
export function clipLinesToPolygon(lines: Line[], polygon: readonly LatLng[]): Line[] {
  const out: Line[] = [];
  const seen = new Set<string>();
  const push = (run: Line) => {
    if (run.length < 2) return;
    const key = JSON.stringify(run.map(([x, y]) => [x.toFixed(6), y.toFixed(6)]));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(run);
  };
  for (const line of lines) {
    let run: Line = [];
    for (const [lng, lat] of line) {
      if (isPointInPolygon([lat, lng], polygon)) run.push([lng, lat]);
      else {
        push(run);
        run = [];
      }
    }
    push(run);
  }
  return out;
}

/** Punto de la ruta dentro del polígono más cercano a su centro; sirve para el pin. */
export function representativePoint(lines: Line[], polygon: readonly LatLng[]): LatLng | null {
  const inside = lines.flat().filter(([lng, lat]) => isPointInPolygon([lat, lng], polygon));
  if (inside.length === 0) return null;
  const cLng = inside.reduce((s, p) => s + p[0], 0) / inside.length;
  const cLat = inside.reduce((s, p) => s + p[1], 0) / inside.length;
  let best = inside[0];
  let bestD = Infinity;
  for (const p of inside) {
    const d = (p[0] - cLng) ** 2 + (p[1] - cLat) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return [best[1], best[0]];
}
