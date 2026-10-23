"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STATUSES } from "@/lib/config";
import {
  endSession,
  isLoginBlocked,
  passwordMatches,
  recordFailedLogin,
  requireAdmin,
  startSession,
} from "@/lib/auth";
import { deleteRejectedReports, deleteReport, setReportStatus } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { deletePhoto } from "@/lib/storage";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = await getClientIp();
  if (await isLoginBlocked(ip)) {
    return { error: "Demasiados intentos. Espera unos minutos." };
  }
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) {
    await recordFailedLogin(ip);
    return { error: "Contraseña incorrecta" };
  }
  await startSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
  // Día en que se arregló (YYYY-MM-DD), opcional; por defecto hoy.
  resolvedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/** Mediodía en Yucatán del día indicado, sin pasar de ahora. */
function resolvedDate(day?: string): Date | undefined {
  if (!day) return undefined;
  const date = new Date(`${day}T12:00:00-06:00`);
  return date > new Date() ? new Date() : date;
}

export async function changeStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const { id, status, resolvedOn } = statusSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
    resolvedOn: formData.get("resolvedOn") ?? undefined,
  });
  const removedPhoto = await setReportStatus(id, status, status === "resuelto" ? resolvedDate(resolvedOn) : undefined);
  await deletePhoto(removedPhoto);
  revalidatePath("/");
  revalidatePath("/admin");
}

/** Marca un reporte como arreglado hoy. Se usa desde el mapa público. */
export async function markFixed(id: string): Promise<void> {
  await requireAdmin();
  await setReportStatus(z.string().uuid().parse(id), "resuelto");
  revalidatePath("/");
  revalidatePath("/admin");
}

/** Vacía la lista de rechazados, incluidas sus fotos. */
export async function removeAllRejected(): Promise<void> {
  await requireAdmin();
  const { photos } = await deleteRejectedReports();
  await Promise.all(photos.map(deletePhoto));
  revalidatePath("/admin");
}

export async function removeReport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await deletePhoto(await deleteReport(id));
  revalidatePath("/");
  revalidatePath("/admin");
}
