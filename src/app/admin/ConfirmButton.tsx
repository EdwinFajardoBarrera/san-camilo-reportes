"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que pide confirmación antes de una acción importante. */
export function ConfirmButton({
  message,
  children,
  className,
  pendingLabel = "Eliminando…",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
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
      {pending ? pendingLabel : children}
    </button>
  );
}
