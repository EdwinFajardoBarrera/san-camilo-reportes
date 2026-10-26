import { getCurrentUser } from "@/lib/auth";
import { STATUSES, type Status } from "@/lib/config";
import { listReportsByStatus } from "@/lib/reports";
import { buildReportsPdf, pdfFileName } from "@/lib/reportsPdf";

export const dynamic = "force-dynamic";

/** PDF con la lista de reportes de la pestaña abierta en el panel. Solo para el equipo. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("No autorizado", { status: 401 });

  const estado = new URL(request.url).searchParams.get("estado");
  const status: Status = STATUSES.includes(estado as Status) ? (estado as Status) : "pendiente";
  const pdf = await buildReportsPdf(await listReportsByStatus(status), status);
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(status)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
