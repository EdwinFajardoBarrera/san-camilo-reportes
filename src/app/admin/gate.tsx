import { getCurrentUser, setupAvailable } from "@/lib/auth";
import { adminExists, type User } from "@/lib/users";
import { logout } from "./actions";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";
import { SetupForm, SetupUnavailable } from "./SetupForm";

/**
 * Decide qué ve quien entra al panel: la configuración inicial (si aún no hay
 * administrador), el inicio de sesión, el cambio obligatorio de contraseña o,
 * si todo está en orden, el usuario para mostrar la página.
 */
export async function gate(): Promise<{ user: User } | { screen: React.ReactNode }> {
  const user = await getCurrentUser();
  if (!user) {
    let screen = <LoginForm />;
    if (!(await adminExists())) screen = setupAvailable() ? <SetupForm /> : <SetupUnavailable />;
    return { screen: <main className="admin admin--login">{screen}</main> };
  }
  if (user.mustChangePassword) {
    return {
      screen: (
        <main className="admin admin--login">
          <div className="card login">
            <h1>Elige tu contraseña</h1>
            <p className="optional">
              Hola, {user.username}. Tu cuenta tiene una contraseña temporal: cámbiala por una que solo tú conozcas.
            </p>
            <PasswordForm forced />
            <form action={logout}>
              <button type="submit" className="btn btn--ghost login__back">
                Salir
              </button>
            </form>
          </div>
        </main>
      ),
    };
  }
  return { user };
}
