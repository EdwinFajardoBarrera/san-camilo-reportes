import { setupAdmin } from "./actions";
import { ActionForm } from "./ActionForm";
import { NewPasswordFields, PasswordField, UsernameField } from "./fields";

/** Primera vez: crea la cuenta del administrador con la contraseña de ADMIN_PASSWORD. */
export function SetupForm() {
  return (
    <div className="card login">
      <h1>Crea tu cuenta de administrador</h1>
      <p className="optional">
        Esto se hace una sola vez. Escribe la contraseña que usabas para entrar al panel y elige tu usuario y una
        contraseña nueva. Después ya no se podrá crear otro administrador y podrás borrar la variable{" "}
        <code>ADMIN_PASSWORD</code> de Vercel.
      </p>
      <ActionForm action={setupAdmin} submitLabel="Crear mi cuenta" pendingLabel="Creando…" className="login__form">
        <PasswordField name="setupPassword" label="Contraseña actual del panel" autoFocus />
        <UsernameField autoComplete="off" />
        <NewPasswordFields />
      </ActionForm>
    </div>
  );
}

/** No hay administrador y tampoco ADMIN_PASSWORD: no hay forma segura de crearlo desde la web. */
export function SetupUnavailable() {
  return (
    <div className="card login">
      <h1>Panel sin administrador</h1>
      <p>
        Todavía no existe la cuenta del administrador. Para crearla, agrega temporalmente la variable{" "}
        <code>ADMIN_PASSWORD</code> en Vercel, vuelve a desplegar y entra aquí de nuevo.
      </p>
    </div>
  );
}
