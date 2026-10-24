"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STATUSES } from "@/lib/config";
import {
  authenticate,
  checkPassword,
  endSession,
  getCurrentUser,
  isLoginBlocked,
  recordFailedLogin,
  requireAdmin,
  requireStaff,
  setupPasswordMatches,
  startSession,
} from "@/lib/auth";
import { deleteRejectedReports, deleteReport, setReportStatus } from "@/lib/reports";
import { getClientIp } from "@/lib/request";
import { deletePhoto } from "@/lib/storage";
import { adminExists, createAdmin, setPassword } from "@/lib/users";
import { newPasswordSchema, usernameSchema } from "@/lib/validation";
import type { FormState } from "./ActionForm";

const BLOCKED = "Demasiados intentos. Espera unos minutos.";
const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await getClientIp();
  const username = usernameSchema.safeParse(field(formData, "username")).data;
  if (await isLoginBlocked(ip, username)) return { error: BLOCKED };
  const user = username ? await authenticate(username, field(formData, "password")) : null;
  if (!user) {
    await recordFailedLogin(ip, username);
    // Mismo mensaje en todos los casos para no revelar qué usuarios existen.
    return { error: "Usuario o contraseña incorrectos" };
  }
  await startSession(user);
  redirect("/admin");
}

/**
 * Configuración inicial: con la contraseña de ADMIN_PASSWORD se crea, una única
 * vez, la cuenta del administrador en la base de datos.
 */
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await adminExists()) return { error: "El administrador ya existe. Entra con tu usuario." };
  const ip = await getClientIp();
  if (await isLoginBlocked(ip)) return { error: BLOCKED };
  if (!setupPasswordMatches(field(formData, "setupPassword"))) {
    await recordFailedLogin(ip);
    return { error: "La contraseña actual del panel no es correcta" };
  }
  const username = usernameSchema.safeParse(field(formData, "username"));
  if (!username.success) return { error: username.error.issues[0].message };
  const password = newPasswordSchema.safeParse({
    username: username.data,
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!password.success) return { error: password.error.issues[0].message };
  if (setupPasswordMatches(password.data.password)) {
    return { error: "Elige una contraseña distinta de la de ADMIN_PASSWORD" };
  }
  const admin = await createAdmin(username.data, password.data.password);
  if (!admin) return { error: "El administrador ya existe. Entra con tu usuario." };
  await startSession(admin);
  redirect("/admin");
}

/** Cambia la contraseña propia. Cierra las sesiones en otros dispositivos. */
export async function changeOwnPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  const ip = await getClientIp();
  if (await isLoginBlocked(ip, user.username)) return { error: BLOCKED };
  const current = field(formData, "current");
  if (!(await checkPassword(user.id, current))) {
    await recordFailedLogin(ip, user.username);
    return { error: "La contraseña actual no es correcta" };
  }
  const parsed = newPasswordSchema.safeParse({
    username: user.username,
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.password === current) return { error: "La contraseña nueva debe ser distinta de la actual" };
  const sessionVersion = await setPassword(user.id, parsed.data.password, false);
  if (sessionVersion === null) redirect("/admin");
  await startSession({ id: user.id, sessionVersion });
  if (user.mustChangePassword) redirect("/admin");
  return { ok: "Listo, tu contraseña se cambió. Se cerró la sesión en tus otros dispositivos." };
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
  const user = await requireStaff();
  const { id, status, resolvedOn } = statusSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
    resolvedOn: formData.get("resolvedOn") ?? undefined,
  });
  const removedPhoto = await setReportStatus(id, status, user.username, status === "resuelto" ? resolvedDate(resolvedOn) : undefined);
  await deletePhoto(removedPhoto);
  revalidatePath("/");
  revalidatePath("/admin");
}

/** Marca un reporte como arreglado hoy. Se usa desde el mapa público. */
export async function markFixed(id: string): Promise<void> {
  const user = await requireStaff();
  await setReportStatus(z.string().uuid().parse(id), "resuelto", user.username);
  revalidatePath("/");
  revalidatePath("/admin");
}

/** Vacía la lista de rechazados, incluidas sus fotos. Solo el administrador. */
export async function removeAllRejected(): Promise<void> {
  await requireAdmin();
  const { photos } = await deleteRejectedReports();
  await Promise.all(photos.map(deletePhoto));
  revalidatePath("/admin");
}

/** Solo el administrador puede eliminar reportes. */
export async function removeReport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await deletePhoto(await deleteReport(id));
  revalidatePath("/");
  revalidatePath("/admin");
}
