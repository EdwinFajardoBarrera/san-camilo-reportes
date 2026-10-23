"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que pide confirmación antes de una acción que no se puede deshacer. */
export function ConfirmButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? "Eliminando…" : children}
    </button>
  );
}
