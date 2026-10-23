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
