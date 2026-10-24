"use client";

import { useActionState, useEffect, useRef } from "react";

export type FormState = { error?: string; ok?: string };

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  children: React.ReactNode;
};

/** Formulario con mensaje de error o de éxito; se limpia al terminar bien. */
export function ActionForm({ action, submitLabel, pendingLabel, className, buttonClassName, children }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className={className}>
      {children}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="success" role="status">
          {state.ok}
        </p>
      )}
      <button type="submit" className={buttonClassName ?? "btn btn--primary"} disabled={pending}>
        {pending ? (pendingLabel ?? "Guardando…") : submitLabel}
      </button>
    </form>
  );
}
