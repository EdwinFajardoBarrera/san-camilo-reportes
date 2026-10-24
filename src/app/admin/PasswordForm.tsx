import { changeOwnPassword } from "./actions";
import { ActionForm } from "./ActionForm";
import { NewPasswordFields, PasswordField } from "./fields";

export function PasswordForm({ forced = false }: { forced?: boolean }) {
  return (
    <ActionForm
      action={changeOwnPassword}
      submitLabel="Cambiar contraseña"
      pendingLabel="Cambiando…"
      className="login__form"
    >
      <PasswordField
        name="current"
        label={forced ? "Contraseña que te dieron" : "Contraseña actual"}
        autoFocus={forced}
      />
      <NewPasswordFields />
    </ActionForm>
  );
}
