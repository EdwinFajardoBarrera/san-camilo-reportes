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
import { deleteReport, setReportStatus } from "@/lib/reports";
import { getClientIp } from "@/lib/request";

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
  redirect("/admin");
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

export async function changeStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const { id, status } = statusSchema.parse({ id: formData.get("id"), status: formData.get("status") });
  await setReportStatus(id, status);
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function removeReport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteReport(id);
  revalidatePath("/");
  revalidatePath("/admin");
}
