import { PASSWORD } from "@/lib/config";

// Campos comunes de los formularios de cuentas. En Android evitan la mayúscula
// automática y la autocorrección del teclado en el usuario.

export function UsernameField({ autoComplete = "username", autoFocus }: { autoComplete?: string; autoFocus?: boolean }) {
  return (
    <label className="field">
      Usuario
      <input
        name="username"
        required
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={3}
        maxLength={32}
        autoFocus={autoFocus}
      />
    </label>
  );
}

export function PasswordField({
  name = "password",
  label = "Contraseña",
  isNew = false,
  autoFocus,
}: {
  name?: string;
  label?: string;
  isNew?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="password"
        name={name}
        required
        autoComplete={isNew ? "new-password" : "current-password"}
        minLength={isNew ? PASSWORD.min : undefined}
        maxLength={PASSWORD.max}
        autoFocus={autoFocus}
      />
    </label>
  );
}

/** Contraseña nueva y su confirmación. */
export function NewPasswordFields({ label = "Contraseña nueva" }: { label?: string }) {
  return (
    <>
      <PasswordField label={label} isNew />
      <p className="optional">Mínimo {PASSWORD.min} caracteres. Una frase de varias palabras es fácil de recordar y segura.</p>
      <PasswordField name="confirm" label="Repite la contraseña" isNew />
    </>
  );
}
