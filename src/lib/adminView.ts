import { CATEGORY_KEYS, type Category } from "./config";
import type { Report } from "./types";

export const SORTS = { fecha: "Fecha", tipo: "Tipo" } as const;
export type Sort = keyof typeof SORTS;

/** Filtro y orden de la lista del panel, leídos de la URL (`?tipo=bache&orden=tipo`). */
export type AdminView = { category: Category | null; sort: Sort };

export function parseAdminView(params: { tipo?: string | null; orden?: string | null }): AdminView {
  const category = CATEGORY_KEYS.includes(params.tipo as Category) ? (params.tipo as Category) : null;
  const sort: Sort = params.orden === "tipo" ? "tipo" : "fecha";
  return { category, sort };
}

/**
 * Aplica el filtro y el orden. «Fecha» respeta el orden que ya traen (el de cada
 * pestaña); «Tipo» los agrupa por categoría sin cambiar ese orden dentro de cada una.
 */
export function applyAdminView(reports: Report[], { category, sort }: AdminView): Report[] {
  const shown = category ? reports.filter((r) => r.category === category) : reports;
  if (sort !== "tipo") return shown;
  return [...shown].sort((a, b) => CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category));
}

/** Parámetros de la URL para una vista, sin los que tienen su valor por omisión. */
export function adminViewQuery(status: string, { category, sort }: AdminView): string {
  const q = new URLSearchParams({ estado: status });
  if (category) q.set("tipo", category);
  if (sort !== "fecha") q.set("orden", sort);
  return q.toString();
}
