import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { REPORT_RATE_LIMIT } from "@/lib/config";
import { createReport, listPublicReports, recentReportsBy } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { anonymize } from "@/lib/secrets";
import { newReportSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = await listPublicReports();
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = newReportSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos inválidos";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const reporterHash = anonymize(await getClientIp());
  if ((await recentReportsBy(reporterHash)) >= REPORT_RATE_LIMIT.max) {
    return NextResponse.json(
      { error: "Has enviado varios reportes seguidos. Intenta de nuevo más tarde." },
      { status: 429 },
    );
  }

  const id = await createReport(parsed.data, reporterHash);
  revalidatePath("/admin");
  return NextResponse.json({ id }, { status: 201 });
}
