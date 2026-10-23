import "server-only";
import { query } from "./db";
import { PUBLIC_STATUSES, REPORT_RATE_LIMIT, type Category, type Status } from "./config";
import type { Report } from "./types";
import type { NewReport } from "./validation";

export type { Report };

type Row = {
  id: string;
  category: Category;
  status: Status;
  description: string | null;
  reference: string | null;
  lat: number;
  lng: number;
  created_at: Date;
  resolved_at: Date | null;
};

const toReport = (r: Row): Report => ({
  id: r.id,
  category: r.category,
  status: r.status,
  description: r.description,
  reference: r.reference,
  lat: r.lat,
  lng: r.lng,
  createdAt: r.created_at.toISOString(),
  resolvedAt: r.resolved_at?.toISOString() ?? null,
});

const COLUMNS = "id, category, status, description, reference, lat, lng, created_at, resolved_at";

export async function listPublicReports(): Promise<Report[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM reports WHERE status = ANY($1) ORDER BY created_at DESC LIMIT 2000`,
    [PUBLIC_STATUSES],
  );
  return rows.map(toReport);
}

export async function listReportsByStatus(status: Status): Promise<Report[]> {
  // Los pendientes se revisan del más antiguo al más nuevo.
  const order = status === "pendiente" ? "ASC" : "DESC";
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM reports WHERE status = $1 ORDER BY created_at ${order} LIMIT 500`,
    [status],
  );
  return rows.map(toReport);
}

export async function countByStatus(): Promise<Record<Status, number>> {
  const rows = await query<{ status: Status; n: number }>(
    "SELECT status, count(*)::int AS n FROM reports GROUP BY status",
  );
  const counts: Record<Status, number> = { pendiente: 0, aprobado: 0, rechazado: 0, resuelto: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Cuántos reportes envió este remitente dentro de la ventana del límite. */
export async function recentReportsBy(reporterHash: string): Promise<number> {
  const [{ n }] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reports
     WHERE reporter_hash = $1 AND created_at > now() - make_interval(mins => $2)`,
    [reporterHash, REPORT_RATE_LIMIT.windowMinutes],
  );
  return n;
}

export async function createReport(input: NewReport, reporterHash: string): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `INSERT INTO reports (category, description, reference, lat, lng, reporter_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.category, input.description, input.reference, input.lat, input.lng, reporterHash],
  );
  return id;
}

/**
 * Cambia el estado de un reporte. Al marcarlo como arreglado se guarda la fecha
 * indicada (o la actual); nunca antes de la fecha del reporte.
 */
export async function setReportStatus(id: string, status: Status, resolvedAt?: Date): Promise<void> {
  const reviewed = status === "aprobado" || status === "rechazado";
  const resolved = status === "resuelto";
  await query(
    `UPDATE reports SET
       status = $2,
       reviewed_at = CASE WHEN $3 THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
       resolved_at = CASE WHEN $4 THEN GREATEST(created_at, COALESCE($5::timestamptz, now())) ELSE NULL END
     WHERE id = $1`,
    [id, status, reviewed, resolved, resolvedAt ?? null],
  );
}

export async function deleteReport(id: string): Promise<void> {
  await query("DELETE FROM reports WHERE id = $1", [id]);
}
