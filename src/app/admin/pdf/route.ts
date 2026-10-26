import { getCurrentUser } from "@/lib/auth";
import { STATUSES, type Status } from "@/lib/config";
import { applyAdminView, parseAdminView } from "@/lib/adminView";
import { listReportsByStatus } from "@/lib/reports";
import { buildReportsPdf, pdfFileName } from "@/lib/reportsPdf";

export const dynamic = "force-dynamic";

/** PDF con la lista de reportes de la pestaña abierta en el panel (con su filtro y orden). Solo para el equipo. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("No autorizado", { status: 401 });

  const params = new URL(request.url).searchParams;
  const estado = params.get("estado");
  const status: Status = STATUSES.includes(estado as Status) ? (estado as Status) : "pendiente";
  const view = parseAdminView({ tipo: params.get("tipo"), orden: params.get("orden") });
  const pdf = await buildReportsPdf(applyAdminView(await listReportsByStatus(status), view), status);
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(status)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
