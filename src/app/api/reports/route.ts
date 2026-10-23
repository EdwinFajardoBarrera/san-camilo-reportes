import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PHOTO, REPORT_RATE_LIMIT } from "@/lib/config";
import { createReport, listPublicReports, recentReportsBy } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { anonymize } from "@/lib/secrets";
import { detectImageType, photosEnabled, savePhoto } from "@/lib/storage";
import { newReportSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET() {
  const reports = await listPublicReports();
  return NextResponse.json({ reports });
}

/** Acepta multipart/form-data: campos del reporte, `path` como JSON y `photo` opcional. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Solicitud inválida", 400);
  }

  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const num = (key: string) => (text(key) === undefined ? undefined : Number(text(key)));
  let path: unknown;
  try {
    path = text("path") ? JSON.parse(text("path")!) : undefined;
  } catch {
    return error("Trazo inválido", 422);
  }

  const parsed = newReportSchema.safeParse({
    category: text("category"),
    lat: num("lat"),
    lng: num("lng"),
    path,
    description: text("description"),
    reference: text("reference"),
    reporterName: text("reporterName"),
    website: text("website"),
  });
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Datos inválidos", 422);

  // Validar la foto antes de contar el envío.
  const photo = form.get("photo");
  let photoBytes: Uint8Array | null = null;
  let photoKind: ReturnType<typeof detectImageType> = null;
  if (photo instanceof File && photo.size > 0) {
    if (!photosEnabled()) return error("Las fotos no están disponibles por ahora", 422);
    if (photo.size > PHOTO.maxBytes) return error("La foto es demasiado grande", 413);
    photoBytes = new Uint8Array(await photo.arrayBuffer());
    photoKind = detectImageType(photoBytes);
    if (!photoKind) return error("La foto debe ser JPG o WebP", 415);
  }

  const reporterHash = anonymize(await getClientIp());
  if ((await recentReportsBy(reporterHash)) >= REPORT_RATE_LIMIT.max) {
    return error("Has enviado varios reportes seguidos. Intenta de nuevo más tarde.", 429);
  }

  const photoUrl = photoBytes && photoKind ? await savePhoto(photoBytes, photoKind) : null;
  const id = await createReport(parsed.data, reporterHash, photoUrl);
  revalidatePath("/admin");
  return NextResponse.json({ id }, { status: 201 });
}
