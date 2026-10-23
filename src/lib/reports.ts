import "server-only";
import { db } from "./db";
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

export async function listPublicReports(): Promise<Report[]> {
  const sql = db();
  const rows = await sql<Row[]>`
    SELECT id, category, status, description, reference, lat, lng, created_at, resolved_at
    FROM reports
    WHERE status IN ${sql(PUBLIC_STATUSES)}
    ORDER BY created_at DESC
    LIMIT 2000`;
  return rows.map(toReport);
}

export async function listReportsByStatus(status: Status): Promise<Report[]> {
  const sql = db();
  const rows = await sql<Row[]>`
    SELECT id, category, status, description, reference, lat, lng, created_at, resolved_at
    FROM reports
    WHERE status = ${status}
    ORDER BY created_at ${status === "pendiente" ? sql`ASC` : sql`DESC`}
    LIMIT 500`;
  return rows.map(toReport);
}

export async function countByStatus(): Promise<Record<Status, number>> {
  const sql = db();
  const rows = await sql<{ status: Status; n: number }[]>`
    SELECT status, count(*)::int AS n FROM reports GROUP BY status`;
  const counts: Record<Status, number> = { pendiente: 0, aprobado: 0, rechazado: 0, resuelto: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Cuántos reportes envió este remitente dentro de la ventana del límite. */
export async function recentReportsBy(reporterHash: string): Promise<number> {
  const sql = db();
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM reports
    WHERE reporter_hash = ${reporterHash}
      AND created_at > now() - make_interval(mins => ${REPORT_RATE_LIMIT.windowMinutes})`;
  return n;
}

export async function createReport(input: NewReport, reporterHash: string): Promise<string> {
  const sql = db();
  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO reports (category, description, reference, lat, lng, reporter_hash)
    VALUES (${input.category}, ${input.description}, ${input.reference}, ${input.lat}, ${input.lng}, ${reporterHash})
    RETURNING id`;
  return id;
}

export async function setReportStatus(id: string, status: Status): Promise<void> {
  const sql = db();
  const reviewed = status === "aprobado" || status === "rechazado";
  const resolved = status === "resuelto";
  await sql`
    UPDATE reports SET
      status = ${status},
      reviewed_at = ${reviewed ? sql`now()` : sql`reviewed_at`},
      resolved_at = ${resolved ? sql`now()` : sql`NULL`}
    WHERE id = ${id}`;
}

export async function deleteReport(id: string): Promise<void> {
  const sql = db();
  await sql`DELETE FROM reports WHERE id = ${id}`;
}
