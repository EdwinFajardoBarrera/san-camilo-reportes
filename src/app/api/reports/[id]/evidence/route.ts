import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { PHOTO } from "@/lib/config";
import { setReportEvidence } from "@/lib/reports";
import { deletePhoto, detectImageType, photosEnabled, savePhoto } from "@/lib/storage";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Admin o colaborador con sesión lista; null si no. */
async function staffUser() {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}

async function reportId(params: Promise<{ id: string }>) {
  return z.string().uuid().safeParse((await params).id).data;
}

/**
 * El equipo sube (o cambia) la foto de evidencia de un reporte. Llega ya
 * comprimida desde el navegador; la anterior se borra del almacenamiento.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await staffUser();
  if (!user) return error("No autorizado", 401);
  if (!photosEnabled()) return error("Las fotos no están disponibles por ahora", 403);
  const id = await reportId(params);
  if (!id) return error("Reporte inválido", 404);

  let photo: FormDataEntryValue | null;
  try {
    photo = (await request.formData()).get("photo");
  } catch {
    return error("Solicitud inválida", 400);
  }
  if (!(photo instanceof File) || photo.size === 0) return error("Falta la foto", 422);
  if (photo.size > PHOTO.maxBytes) return error("La foto es demasiado grande", 413);
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const kind = detectImageType(bytes);
  if (!kind) return error("La foto debe ser JPG o WebP", 415);

  const url = await savePhoto(bytes, kind);
  const result = await setReportEvidence(id, url, user.username);
  if (!result) {
    await deletePhoto(url);
    return error("El reporte ya no existe", 404);
  }
  await deletePhoto(result.previous);
  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ url });
}

/** Quita la foto de evidencia. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await staffUser();
  if (!user) return error("No autorizado", 401);
  const id = await reportId(params);
  if (!id) return error("Reporte inválido", 404);
  const result = await setReportEvidence(id, null, user.username);
  if (!result) return error("El reporte ya no existe", 404);
  await deletePhoto(result.previous);
  revalidatePath("/");
  revalidatePath("/admin");
  return new NextResponse(null, { status: 204 });
}
