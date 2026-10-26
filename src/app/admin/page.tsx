import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_KEYS, STATUSES, STATUS_LABELS, categoryConfig, type Status } from "@/lib/config";
import { groupNearby, nearbyPublished } from "@/lib/duplicates";
import { pathLength } from "@/lib/geo";
import { agoLabel, daysBetween, daysLabel, formatDate, localDay, TIME_ZONE } from "@/lib/dates";
import { SORTS, adminViewQuery, applyAdminView, parseAdminView, type Sort } from "@/lib/adminView";
import { countByStatus, listReportsByStatus, type Report } from "@/lib/reports";
import { approveAllPending, changeStatus, removeAllRejected, removeReport } from "./actions";
import { ConfirmButton } from "./ConfirmButton";
import { AdminMap } from "./AdminMap";
import { AdminHeader } from "./AdminHeader";
import { gate } from "./gate";

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

function ReportCard({ report, nearby = [], canDelete }: { report: Report; nearby?: Nearby; canDelete: boolean }) {
  const cat = CATEGORIES[report.category];
  const osm = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=19/${report.lat}/${report.lng}`;
  return (
    <li
      className="card report"
      data-report-id={report.id}
      tabIndex={0}
      title="Ver en el mapa"
      style={{ "--chip-color": cat.color } as React.CSSProperties}
    >
      <div className="report__head">
        <strong>
          {cat.icon} {cat.label}
        </strong>
      </div>
      <ReportDates report={report} />
      <p className="report__dates">Por: {report.reporterName ?? "anónimo"}</p>
      {report.reviewedBy && <p className="report__dates">Último cambio: {report.reviewedBy}</p>}
      <NearbyWarning nearby={nearby} />
      {report.status === "aprobado" && report.fixedVotes > 0 && (
        <p className="fixed-hint">
          ✅ <strong>{report.fixedVotes === 1 ? "1 vecino dice" : `${report.fixedVotes} vecinos dicen`}</strong> que ya
          se arregló. Revisa y márcalo como arreglado si es así.
        </p>
      )}
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
        {canDelete && report.status === "rechazado" && (
          <form action={removeReport}>
            <input type="hidden" name="id" value={report.id} />
            <ConfirmButton className="btn btn--danger" message="¿Eliminar este reporte? No se puede deshacer.">
              Eliminar
            </ConfirmButton>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ estado?: string; tipo?: string; orden?: string }> }) {
  const access = await gate();
  if ("screen" in access) return access.screen;
  const canDelete = access.user.role === "admin";

  const { estado, tipo, orden } = await searchParams;
  const status: Status = STATUSES.includes(estado as Status) ? (estado as Status) : "pendiente";
  const view = parseAdminView({ tipo, orden });
  const [all, counts, published] = await Promise.all([
    listReportsByStatus(status),
    countByStatus(),
    // Para avisar si un pendiente repite algo ya publicado.
    status === "pendiente"
      ? Promise.all([listReportsByStatus("aprobado"), listReportsByStatus("resuelto")]).then((r) => r.flat())
      : Promise.resolve([] as Report[]),
  ]);
  const reports = applyAdminView(all, view);
  const groups = groupNearby(reports);
  const typeCounts = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, all.filter((r) => r.category === k).length]));

  return (
    <main className="admin">
      <AdminHeader user={access.user} title="Panel de reportes" />

      <nav className="tabs" aria-label="Estado">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin?${adminViewQuery(s, view)}`} className="tab" aria-current={s === status ? "page" : undefined}>
            {STATUS_LABELS[s]} <span className="chip__count">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      <div className="admin__body">
        <AdminMap reports={reports} />
        <section className="admin__list">
          {all.length > 0 && (
            <div className="list-tools">
              <nav className="filters" aria-label="Filtrar por tipo">
                <Link
                  href={`/admin?${adminViewQuery(status, { ...view, category: null })}`}
                  className="chip"
                  aria-pressed={view.category === null}
                >
                  Todos <span className="chip__count">{all.length}</span>
                </Link>
                {CATEGORY_KEYS.map((key) => (
                  <Link
                    key={key}
                    href={`/admin?${adminViewQuery(status, { ...view, category: key })}`}
                    className="chip"
                    aria-pressed={view.category === key}
                    style={{ "--chip-color": CATEGORIES[key].color } as React.CSSProperties}
                  >
                    <span aria-hidden>{CATEGORIES[key].icon}</span>
                    {CATEGORIES[key].label}
                    <span className="chip__count">{typeCounts[key]}</span>
                  </Link>
                ))}
              </nav>
              <nav className="sort" aria-label="Ordenar">
                Ordenar por:
                {(Object.keys(SORTS) as Sort[]).map((sort) => (
                  <Link
                    key={sort}
                    href={`/admin?${adminViewQuery(status, { ...view, sort })}`}
                    className="sort__option"
                    aria-current={view.sort === sort ? "true" : undefined}
                  >
                    {SORTS[sort]}
                  </Link>
                ))}
              </nav>
            </div>
          )}
          {reports.length > 0 && (
            <div className="pdf-bar">
              <a href={`/admin/pdf?${adminViewQuery(status, view)}`} className="btn btn--ghost btn--small" download>
                Descargar PDF ({reports.length})
              </a>
            </div>
          )}
          {status === "pendiente" && reports.length > 0 && (
            <form action={approveAllPending} className="bulk-bar bulk-bar--ok">
              {reports.map((r) => (
                <input key={r.id} type="hidden" name="id" value={r.id} />
              ))}
              <span>
                {reports.length} {reports.length === 1 ? "reporte pendiente" : "reportes pendientes"}
              </span>
              <ConfirmButton
                className="btn btn--primary"
                pendingLabel="Aprobando…"
                message={
                  `¿Aprobar ${reports.length === 1 ? "el reporte pendiente" : `los ${reports.length} reportes pendientes`}? Se publicarán en el mapa.` +
                  (groups.some((g) => g.length > 1) ? " Ojo: hay reportes repetidos que también se publicarán." : "")
                }
              >
                Aprobar todos
              </ConfirmButton>
            </form>
          )}
          {canDelete && status === "rechazado" && reports.length > 0 && (
            <form action={removeAllRejected} className="bulk-bar">
              <span>
                {reports.length} {reports.length === 1 ? "reporte rechazado" : "reportes rechazados"}
              </span>
              <ConfirmButton
                className="btn btn--danger"
                message={`¿Eliminar los ${reports.length} reportes rechazados y sus fotos? No se puede deshacer.`}
              >
                Eliminar todos
              </ConfirmButton>
            </form>
          )}
          {reports.length === 0 ? (
            <p className="empty">
              {view.category && all.length > 0
                ? `No hay reportes de «${CATEGORIES[view.category].label}» en «${STATUS_LABELS[status]}».`
                : `No hay reportes en «${STATUS_LABELS[status]}».`}
            </p>
          ) : (
            <ul>
              {groups.map((group) =>
                group.length === 1 ? (
                  <ReportCard
                    key={group[0].id}
                    report={group[0]}
                    nearby={nearbyPublished(group[0], published)}
                    canDelete={canDelete}
                  />
                ) : (
                  <li key={group[0].id} className="dup-group">
                    <p className="dup-group__title">
                      ⚠️ {group.length} reportes de «{CATEGORIES[group[0].category].label}» muy cerca entre sí. Puede
                      ser el mismo problema: aprueba uno y rechaza los repetidos.
                    </p>
                    <ul>
                      {group.map((r) => (
                        <ReportCard key={r.id} report={r} nearby={nearbyPublished(r, published)} canDelete={canDelete} />
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
