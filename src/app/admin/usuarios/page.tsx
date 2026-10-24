import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/dates";
import { listUsers, type User } from "@/lib/users";
import { ActionForm } from "../ActionForm";
import { AdminHeader } from "../AdminHeader";
import { ConfirmButton } from "../ConfirmButton";
import { NewPasswordFields, UsernameField } from "../fields";
import { gate } from "../gate";
import { addCollaborator, removeCollaborator, resetCollaboratorPassword, toggleCollaborator } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Colaboradores · Reportes", robots: { index: false } };

function CollaboratorCard({ user }: { user: User }) {
  return (
    <li className="card user">
      <div className="report__head">
        <strong>{user.username}</strong>
        <span className={`badge${user.active ? "" : " badge--off"}`}>{user.active ? "Activo" : "Desactivado"}</span>
      </div>
      <p className="report__dates">
        Alta el {formatDate(user.createdAt)} ·{" "}
        {user.lastLoginAt ? `última entrada el ${formatDate(user.lastLoginAt)}` : "aún no entra"}
        {user.mustChangePassword && " · tiene contraseña temporal"}
      </p>
      <div className="report__actions">
        <form action={toggleCollaborator}>
          <input type="hidden" name="id" value={user.id} />
          <button type="submit" className="btn btn--ghost btn--small">
            {user.active ? "Desactivar" : "Activar"}
          </button>
        </form>
        <form action={removeCollaborator}>
          <input type="hidden" name="id" value={user.id} />
          <ConfirmButton
            className="btn btn--danger btn--small"
            message={`¿Eliminar la cuenta «${user.username}»? No se puede deshacer.`}
          >
            Eliminar
          </ConfirmButton>
        </form>
      </div>
      <details className="user__reset">
        <summary>Poner contraseña temporal</summary>
        <ActionForm
          action={resetCollaboratorPassword}
          submitLabel="Guardar contraseña temporal"
          className="login__form"
          buttonClassName="btn btn--ghost"
        >
          <input type="hidden" name="id" value={user.id} />
          <NewPasswordFields label="Contraseña temporal" />
        </ActionForm>
      </details>
    </li>
  );
}

export default async function UsersPage() {
  const access = await gate();
  if ("screen" in access) return access.screen;
  // Los colaboradores no pueden ver ni manejar cuentas.
  if (access.user.role !== "admin") redirect("/admin");

  const collaborators = (await listUsers()).filter((u) => u.role === "colaborador");

  return (
    <main className="admin">
      <AdminHeader user={access.user} title="Colaboradores" />
      <section className="admin__page">
        <div className="card login">
          <h2>Nuevo colaborador</h2>
          <p className="optional">
            Puede aprobar, rechazar y marcar como arreglados los reportes, pero no eliminarlos ni crear cuentas. Dale
            el usuario y la contraseña en persona; al entrar la primera vez tendrá que cambiarla.
          </p>
          <ActionForm action={addCollaborator} submitLabel="Crear cuenta" pendingLabel="Creando…" className="login__form">
            <UsernameField autoComplete="off" />
            <NewPasswordFields label="Contraseña temporal" />
          </ActionForm>
        </div>

        <h2>Cuentas ({collaborators.length})</h2>
        {collaborators.length === 0 ? (
          <p className="empty">Todavía no hay colaboradores.</p>
        ) : (
          <ul className="user-list">
            {collaborators.map((u) => (
              <CollaboratorCard key={u.id} user={u} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
