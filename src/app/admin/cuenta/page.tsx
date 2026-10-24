import type { Metadata } from "next";
import { AdminHeader } from "../AdminHeader";
import { gate } from "../gate";
import { PasswordForm } from "../PasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cuenta · Reportes", robots: { index: false } };

export default async function AccountPage() {
  const access = await gate();
  if ("screen" in access) return access.screen;
  return (
    <main className="admin">
      <AdminHeader user={access.user} title="Mi cuenta" />
      <section className="admin__page">
        <div className="card login">
          <h2>Cambiar contraseña</h2>
          <p className="optional">Al cambiarla se cierra tu sesión en los demás teléfonos o computadoras.</p>
          <PasswordForm />
        </div>
      </section>
    </main>
  );
}
