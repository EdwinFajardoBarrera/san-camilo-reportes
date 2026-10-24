import Link from "next/link";
import type { User } from "@/lib/users";
import { logout } from "./actions";

export function AdminHeader({ user, title }: { user: User; title: string }) {
  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1>{title}</h1>
        <span className="topbar__user">
          {user.username} · {user.role === "admin" ? "administrador" : "colaborador"}
        </span>
      </div>
      <nav className="topbar__actions" aria-label="Panel">
        <Link href="/admin" className="link-muted">
          Reportes
        </Link>
        {user.role === "admin" && (
          <Link href="/admin/usuarios" className="link-muted">
            Colaboradores
          </Link>
        )}
        <Link href="/admin/cuenta" className="link-muted">
          Mi cuenta
        </Link>
        <Link href="/" className="link-muted">
          Mapa
        </Link>
        <form action={logout}>
          <button type="submit" className="btn btn--ghost btn--small">
            Salir
          </button>
        </form>
      </nav>
    </header>
  );
}
