import { categoryConfig } from "./config";
import { distanceToLine } from "./geo";
import type { Report } from "./types";

/** Distancia máxima para considerar dos reportes como el mismo problema. */
export const DUPLICATE_RADIUS_M = { point: 40, street: 80 };

function radiusFor(r: Report) {
  return categoryConfig(r.category).isStreet ? DUPLICATE_RADIUS_M.street : DUPLICATE_RADIUS_M.point;
}

/** Distancia en metros entre dos reportes; para calles, del pin al trazo. */
export function reportDistance(a: Report, b: Report): number {
  const target = b.path ?? [[[b.lng, b.lat] as [number, number], [b.lng, b.lat] as [number, number]]];
  return Math.min(...target.map((line) => distanceToLine([a.lat, a.lng], line)));
}

const isNear = (a: Report, b: Report) =>
  a.category === b.category && Math.min(reportDistance(a, b), reportDistance(b, a)) <= radiusFor(a);

/**
 * Agrupa reportes de la misma categoría que están cerca entre sí (enlace simple:
 * si A está cerca de B y B de C, los tres van juntos). Conserva el orden original.
 */
export function groupNearby(reports: Report[]): Report[][] {
  const parent = reports.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      if (isNear(reports[i], reports[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Report[]>();
  reports.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  return [...groups.values()];
}

/** Reportes ya publicados cerca de uno nuevo, del más cercano al más lejano. */
export function nearbyPublished(report: Report, published: Report[]): { report: Report; meters: number }[] {
  return published
    .filter((p) => p.id !== report.id && isNear(report, p))
    .map((p) => ({ report: p, meters: Math.round(Math.min(reportDistance(report, p), reportDistance(p, report))) }))
    .sort((a, b) => a.meters - b.meters);
}

/**
 * Reportes publicados y sin arreglar cerca de lo que un vecino está por enviar,
 * para preguntarle si no es el mismo problema.
 */
export function similarNearby(
  candidate: Pick<Report, "category" | "lat" | "lng" | "path">,
  published: Report[],
): { report: Report; meters: number }[] {
  const draft: Report = {
    ...candidate,
    id: "",
    status: "pendiente",
    description: null,
    reference: null,
    createdAt: "",
    resolvedAt: null,
    photoUrl: null,
    reporterName: null,
    supportCount: 0,
    fixedVotes: 0,
  };
  return nearbyPublished(
    draft,
    published.filter((p) => p.status === "aprobado"),
  );
}
