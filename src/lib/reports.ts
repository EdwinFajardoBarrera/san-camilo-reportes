import "server-only";
import { query } from "./db";
import { PUBLIC_STATUSES, REPORT_RATE_LIMIT, type Category, type Status } from "./config";
import type { Line } from "./geo";
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
  path: Line[] | null;
  photo_url: string | null;
  reporter_name: string | null;
  support_count: number;
  fixed_votes: number;
  reviewed_by: string | null;
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
  path: r.path,
  photoUrl: r.photo_url,
  reporterName: r.reporter_name,
  supportCount: r.support_count,
  fixedVotes: r.fixed_votes,
  reviewedBy: r.reviewed_by,
});

const COLUMNS = `id, category, status, description, reference, lat, lng, created_at, resolved_at, path, photo_url, reporter_name, reviewed_by,
  (SELECT count(*)::int FROM supports s WHERE s.report_id = reports.id) AS support_count,
  (SELECT count(*)::int FROM fixed_votes f WHERE f.report_id = reports.id) AS fixed_votes`;

export async function listPublicReports(): Promise<Report[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM reports WHERE status = ANY($1) ORDER BY created_at DESC LIMIT 2000`,
    [PUBLIC_STATUSES],
  );
  // El público no ve quién del equipo revisó cada reporte.
  return rows.map((row) => ({ ...toReport(row), reviewedBy: undefined }));
}

export async function listReportsByStatus(status: Status): Promise<Report[]> {
  // Los pendientes se revisan del más antiguo al más nuevo. En los publicados
  // van primero los que más vecinos dicen que ya se arreglaron.
  const order =
    status === "pendiente"
      ? "created_at ASC"
      : status === "aprobado"
        ? "fixed_votes DESC, created_at DESC"
        : "created_at DESC";
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM reports WHERE status = $1 ORDER BY ${order} LIMIT 500`,
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

export async function createReport(
  input: NewReport,
  reporterHash: string,
  photoUrl: string | null = null,
): Promise<string> {
  const [{ id }] = await query<{ id: string }>(
    `INSERT INTO reports (category, description, reference, lat, lng, path, photo_url, reporter_name, reporter_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      input.category,
      input.description,
      input.reference,
      input.lat,
      input.lng,
      input.path ? JSON.stringify(input.path) : null,
      photoUrl,
      input.reporterName,
      reporterHash,
    ],
  );
  return id;
}

/**
 * Cambia el estado de un reporte. Al marcarlo como arreglado se guarda la fecha
 * indicada (o la actual); nunca antes de la fecha del reporte. Al rechazarlo se
 * quita la foto. Al reabrirlo se borran los avisos de arreglado, que ya no aplican.
 * Se guarda quién hizo el cambio. Devuelve la URL de la foto que haya que borrar del almacenamiento.
 */
export async function setReportStatus(
  id: string,
  status: Status,
  reviewedBy: string,
  resolvedAt?: Date,
): Promise<string | null> {
  const reviewed = status === "aprobado" || status === "rechazado";
  const resolved = status === "resuelto";
  const rejected = status === "rechazado";
  const rows = await query<{ removed_photo: string | null }>(
    `WITH old AS (SELECT photo_url FROM reports WHERE id = $1)
     UPDATE reports SET
       status = $2,
       reviewed_at = CASE WHEN $3 THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
       resolved_at = CASE WHEN $4 THEN GREATEST(created_at, COALESCE($5::timestamptz, now())) ELSE NULL END,
       photo_url = CASE WHEN $6 THEN NULL ELSE photo_url END,
       reviewed_by = $7
     WHERE id = $1
     RETURNING CASE WHEN $6 THEN (SELECT photo_url FROM old) END AS removed_photo`,
    [id, status, reviewed, resolved, resolvedAt ?? null, rejected, reviewedBy],
  );
  if (status === "aprobado") await query("DELETE FROM fixed_votes WHERE report_id = $1", [id]);
  return rows[0]?.removed_photo ?? null;
}

/**
 * Aprueba de una vez los reportes indicados que sigan pendientes. Solo toca los
 * que el moderador tenía a la vista, no los que hayan llegado después.
 * Devuelve cuántos se aprobaron.
 */
export async function approvePendingReports(ids: string[], reviewedBy: string): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await query<{ id: string }>(
    `UPDATE reports SET status = 'aprobado', reviewed_at = COALESCE(reviewed_at, now()), reviewed_by = $2
     WHERE id = ANY($1::uuid[]) AND status = 'pendiente'
     RETURNING id`,
    [ids, reviewedBy],
  );
  return rows.length;
}

/** Borra el reporte y devuelve la URL de su foto, si tenía. */
export async function deleteReport(id: string): Promise<string | null> {
  const rows = await query<{ photo_url: string | null }>("DELETE FROM reports WHERE id = $1 RETURNING photo_url", [id]);
  return rows[0]?.photo_url ?? null;
}

/** Borra todos los reportes rechazados y devuelve las URLs de sus fotos. */
export async function deleteRejectedReports(): Promise<{ count: number; photos: string[] }> {
  const rows = await query<{ photo_url: string | null }>(
    "DELETE FROM reports WHERE status = 'rechazado' RETURNING photo_url",
  );
  return { count: rows.length, photos: rows.flatMap((r) => (r.photo_url ? [r.photo_url] : [])) };
}

/**
 * Registra el apoyo de un vecino (uno por persona) a un reporte aprobado de una
 * categoría que lo permite. Devuelve el total, o null si no se puede apoyar.
 */
export async function addSupport(reportId: string, supporterHash: string, categories: Category[]): Promise<number | null> {
  const [report] = await query<{ id: string }>(
    "SELECT id FROM reports WHERE id = $1 AND status = 'aprobado' AND category = ANY($2)",
    [reportId, categories],
  );
  if (!report) return null;
  await query(
    "INSERT INTO supports (report_id, supporter_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [reportId, supporterHash],
  );
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM supports WHERE report_id = $1", [reportId]);
  return n;
}

/**
 * Registra el aviso de un vecino (uno por persona) de que un reporte aprobado ya
 * se arregló. No cambia el estado. Devuelve el total, o null si no se puede avisar.
 */
export async function addFixedVote(reportId: string, voterHash: string): Promise<number | null> {
  const [report] = await query<{ id: string }>("SELECT id FROM reports WHERE id = $1 AND status = 'aprobado'", [reportId]);
  if (!report) return null;
  await query("INSERT INTO fixed_votes (report_id, voter_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    reportId,
    voterHash,
  ]);
  const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM fixed_votes WHERE report_id = $1", [reportId]);
  return n;
}
