import type { Metadata } from "next";
import Link from "next/link";
import { ReportMap } from "@/components/MapLoader";
import { isAdmin } from "@/lib/auth";
import { CATEGORIES, STATUSES, STATUS_LABELS, categoryConfig, type Status } from "@/lib/config";
import { groupNearby, nearbyPublished } from "@/lib/duplicates";
import { pathLength } from "@/lib/geo";
import { agoLabel, daysBetween, daysLabel, formatDate, localDay, TIME_ZONE } from "@/lib/dates";
import { countByStatus, listReportsByStatus, type Report } from "@/lib/reports";
import { changeStatus, logout, removeReport } from "./actions";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Reportes", robots: { index: false } };

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });

/** Acciones disponibles según el estado actual del reporte. */
const NEXT_ACTIONS: Record<Status, { status: Status; label: string; style: string }[]> = {
  pendiente: [
    { status: "aprobado", label: "Aprobar", style: "btn--primary" },
    { status: "rechazado", label: "Rechazar", style: "btn--danger" },
  ],
  // "Marcar arreglado" tiene su propio formulario con fecha (ver FixForm).
  aprobado: [{ status: "rechazado", label: "Ocultar", style: "btn--ghost" }],
  resuelto: [{ status: "aprobado", label: "Reabrir", style: "btn--ghost" }],
  rechazado: [{ status: "aprobado", label: "Aprobar", style: "btn--primary" }],
};

function FixForm({ report }: { report: Report }) {
  const today = localDay(new Date());
  return (
    <form action={changeStatus} className="fix-form">
      <input type="hidden" name="id" value={report.id} />
      <input type="hidden" name="status" value="resuelto" />
      <label>
        Arreglado el
        <input type="date" name="resolvedOn" defaultValue={today} min={localDay(report.createdAt)} max={today} />
      </label>
      <button type="submit" className="btn btn--primary">
        Marcar arreglado
      </button>
    </form>
  );
}

function ReportDates({ report }: { report: Report }) {
  if (report.status === "resuelto" && report.resolvedAt) {
    const took = daysBetween(report.createdAt, report.resolvedAt);
    return (
      <p className="report__dates">
        Reportado el {formatDate(report.createdAt)} · Arreglado el {formatDate(report.resolvedAt)} ·{" "}
        <strong>{took === 0 ? "el mismo día" : `tardó ${daysLabel(took)}`}</strong>
      </p>
    );
  }
  const open = daysBetween(report.createdAt);
  return (
    <p className="report__dates">
      Reportado {agoLabel(open)} ({dateTime.format(new Date(report.createdAt))})
    </p>
  );
}

type Nearby = ReturnType<typeof nearbyPublished>;

function NearbyWarning({ nearby }: { nearby: Nearby }) {
  if (nearby.length === 0) return null;
  return (
    <div className="dup-warning">
      <strong>Ya hay {nearby.length === 1 ? "un reporte publicado" : `${nearby.length} reportes publicados`} cerca:</strong>
      <ul>
        {nearby.slice(0, 3).map(({ report, meters }) => (
          <li key={report.id}>
            a {meters} m · {STATUS_LABELS[report.status].toLowerCase()} · reportado {agoLabel(daysBetween(report.createdAt))}
            {report.reference && ` · ${report.reference}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportCard({ report, nearby = [] }: { report: Report; nearby?: Nearby }) {
  const cat = CATEGORIES[report.category];
  const osm = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=19/${report.lat}/${report.lng}`;
  return (
    <li className="card report" style={{ "--chip-color": cat.color } as React.CSSProperties}>
      <div className="report__head">
        <strong>
          {cat.icon} {cat.label}
        </strong>
      </div>
      <ReportDates report={report} />
      <NearbyWarning nearby={nearby} />
      {report.photoUrl && (
        <a href={report.photoUrl} target="_blank" rel="noreferrer" className="report__photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos ya comprimidas, servidas desde Blob */}
          <img src={report.photoUrl} alt={`Foto del reporte: ${cat.label}`} loading="lazy" />
        </a>
      )}
      {report.path && (
        <p className="report__dates">
          Calle marcada: ≈ {Math.round(pathLength(report.path))} m
          {categoryConfig(report.category).supportLabel && ` · ${report.supportCount} apoyos`}
        </p>
      )}
      {report.reference && <p className="popup__ref">{report.reference}</p>}
      {report.description ? <p>{report.description}</p> : <p className="optional">Sin descripción</p>}
      <a href={osm} target="_blank" rel="noreferrer" className="link-muted">
        Ver ubicación ({report.lat.toFixed(5)}, {report.lng.toFixed(5)})
      </a>
      {report.status === "aprobado" && <FixForm report={report} />}
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
  const [reports, counts, published] = await Promise.all([
    listReportsByStatus(status),
    countByStatus(),
    // Para avisar si un pendiente repite algo ya publicado.
    status === "pendiente"
      ? Promise.all([listReportsByStatus("aprobado"), listReportsByStatus("resuelto")]).then((r) => r.flat())
      : Promise.resolve([] as Report[]),
  ]);
  const groups = groupNearby(reports);

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
            <p className="empty">No hay reportes en «{STATUS_LABELS[status]}».</p>
          ) : (
            <ul>
              {groups.map((group) =>
                group.length === 1 ? (
                  <ReportCard key={group[0].id} report={group[0]} nearby={nearbyPublished(group[0], published)} />
                ) : (
                  <li key={group[0].id} className="dup-group">
                    <p className="dup-group__title">
                      ⚠️ {group.length} reportes de «{CATEGORIES[group[0].category].label}» muy cerca entre sí. Puede
                      ser el mismo problema: aprueba uno y rechaza los repetidos.
                    </p>
                    <ul>
                      {group.map((r) => (
                        <ReportCard key={r.id} report={r} nearby={nearbyPublished(r, published)} />
                      ))}
                    </ul>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
