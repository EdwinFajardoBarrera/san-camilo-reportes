import type { Metadata } from "next";
import Link from "next/link";
import { ReportMap } from "@/components/MapLoader";
import { isAdmin } from "@/lib/auth";
import { CATEGORIES, STATUSES, STATUS_LABELS, type Status } from "@/lib/config";
import { countByStatus, listReportsByStatus, type Report } from "@/lib/reports";
import { changeStatus, logout, removeReport } from "./actions";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Reportes", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Merida" });

/** Acciones disponibles según el estado actual del reporte. */
const NEXT_ACTIONS: Record<Status, { status: Status; label: string; style: string }[]> = {
  pendiente: [
    { status: "aprobado", label: "Aprobar", style: "btn--primary" },
    { status: "rechazado", label: "Rechazar", style: "btn--danger" },
  ],
  aprobado: [
    { status: "resuelto", label: "Marcar resuelto", style: "btn--primary" },
    { status: "rechazado", label: "Ocultar", style: "btn--ghost" },
  ],
  resuelto: [{ status: "aprobado", label: "Reabrir", style: "btn--ghost" }],
  rechazado: [{ status: "aprobado", label: "Aprobar", style: "btn--primary" }],
};

function ReportCard({ report }: { report: Report }) {
  const cat = CATEGORIES[report.category];
  const osm = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=19/${report.lat}/${report.lng}`;
  return (
    <li className="card report" style={{ "--chip-color": cat.color } as React.CSSProperties}>
      <div className="report__head">
        <strong>
          {cat.icon} {cat.label}
        </strong>
        <time dateTime={report.createdAt}>{dateFormat.format(new Date(report.createdAt))}</time>
      </div>
      {report.reference && <p className="popup__ref">{report.reference}</p>}
      {report.description ? <p>{report.description}</p> : <p className="optional">Sin descripción</p>}
      <a href={osm} target="_blank" rel="noreferrer" className="link-muted">
        Ver ubicación ({report.lat.toFixed(5)}, {report.lng.toFixed(5)})
      </a>
      <div className="report__actions">
        {NEXT_ACTIONS[report.status].map((a) => (
          <form key={a.status} action={changeStatus}>
            <input type="hidden" name="id" value={report.id} />
            <input type="hidden" name="status" value={a.status} />
            <button type="submit" className={`btn ${a.style}`}>
              {a.label}
            </button>
          </form>
        ))}
        {report.status === "rechazado" && (
          <form action={removeReport}>
            <input type="hidden" name="id" value={report.id} />
            <button type="submit" className="btn btn--danger">
              Eliminar
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (!(await isAdmin())) {
    return (
      <main className="admin admin--login">
        <LoginForm />
      </main>
    );
  }

  const { estado } = await searchParams;
  const status: Status = STATUSES.includes(estado as Status) ? (estado as Status) : "pendiente";
  const [reports, counts] = await Promise.all([listReportsByStatus(status), countByStatus()]);

  return (
    <main className="admin">
      <header className="topbar">
        <h1>Panel de reportes</h1>
        <div className="topbar__actions">
          <Link href="/" className="link-muted">
            Ver mapa público
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn--ghost">
              Salir
            </button>
          </form>
        </div>
      </header>

      <nav className="tabs" aria-label="Estado">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin?estado=${s}`} className="tab" aria-current={s === status ? "page" : undefined}>
            {STATUS_LABELS[s]} <span className="chip__count">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      <div className="admin__body">
        <section className="admin__map">
          <ReportMap reports={reports} showStatus />
        </section>
        <section className="admin__list">
          {reports.length === 0 ? (
            <p className="empty">No hay reportes {STATUS_LABELS[status].toLowerCase()}s.</p>
          ) : (
            <ul>
              {reports.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
