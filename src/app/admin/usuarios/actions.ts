"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createCollaborator, deleteCollaborator, findUserById, setCollaboratorActive, setPassword } from "@/lib/users";
import { newPasswordSchema, usernameSchema } from "@/lib/validation";
import type { FormState } from "../ActionForm";

// Todo lo de esta página es solo para el administrador. Los colaboradores no
// pueden crear cuentas ni tocar las de otros, y nadie puede crear otro admin.

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");

/** Colaborador al que se le aplica la acción (nunca el administrador). */
async function collaborator(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const user = await findUserById(id);
  if (!user || user.role !== "colaborador") throw new Error("Colaborador no encontrado");
  return user;
}

export async function addCollaborator(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const username = usernameSchema.safeParse(field(formData, "username"));
  if (!username.success) return { error: username.error.issues[0].message };
  const password = newPasswordSchema.safeParse({
    username: username.data,
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!password.success) return { error: password.error.issues[0].message };
  const user = await createCollaborator(username.data, password.data.password);
  if (!user) return { error: `Ya existe una cuenta «${username.data}»` };
  revalidatePath("/admin/usuarios");
  return { ok: `Cuenta «${user.username}» creada. Al entrar por primera vez tendrá que cambiar la contraseña.` };
}

export async function resetCollaboratorPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const user = await collaborator(formData);
  const password = newPasswordSchema.safeParse({
    username: user.username,
    password: field(formData, "password"),
    confirm: field(formData, "confirm"),
  });
  if (!password.success) return { error: password.error.issues[0].message };
  await setPassword(user.id, password.data.password, true);
  revalidatePath("/admin/usuarios");
  return { ok: "Contraseña temporal guardada. Se cerraron sus sesiones y la cambiará al entrar." };
}

export async function toggleCollaborator(formData: FormData): Promise<void> {
  await requireAdmin();
  const user = await collaborator(formData);
  await setCollaboratorActive(user.id, !user.active);
  revalidatePath("/admin/usuarios");
}

export async function removeCollaborator(formData: FormData): Promise<void> {
  await requireAdmin();
  const user = await collaborator(formData);
  await deleteCollaborator(user.id);
  revalidatePath("/admin/usuarios");
}
