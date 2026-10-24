import Link from "next/link";
import { login } from "./actions";
import { ActionForm } from "./ActionForm";
import { PasswordField, UsernameField } from "./fields";

export function LoginForm() {
  return (
    <div className="card login">
      <h1>Panel de reportes</h1>
      <ActionForm action={login} submitLabel="Entrar" pendingLabel="Entrando…" className="login__form">
        <UsernameField autoFocus />
        <PasswordField />
      </ActionForm>
      <Link href="/" className="btn btn--ghost login__back">
        ← Ir al mapa público
      </Link>
    </div>
  );
}
