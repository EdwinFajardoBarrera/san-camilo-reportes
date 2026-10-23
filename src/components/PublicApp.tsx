"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, NEIGHBORHOOD, type Category, type LatLng } from "@/lib/config";
import { isPointInPolygon } from "@/lib/geo";
import type { Report } from "@/lib/types";
import { ReportMap } from "./MapLoader";
import { ReportForm } from "./ReportForm";

type Mode = "view" | "pick" | "form";

export function PublicApp({ initialReports }: { initialReports: Report[] }) {
  const [active, setActive] = useState<Set<Category>>(() => new Set(CATEGORY_KEYS));
  const [showResolved, setShowResolved] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const visible = useMemo(
    () => initialReports.filter((r) => active.has(r.category) && (showResolved || r.status !== "resuelto")),
    [initialReports, active, showResolved],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<Category, number>;
    for (const r of initialReports) if (r.status !== "resuelto") c[r.category]++;
    return c;
  }, [initialReports]);

  function toggle(cat: Category) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function startReport() {
    setNotice(null);
    setPickError(null);
    setDraft(null);
    setMode("pick");
  }

  function pick(point: LatLng) {
    if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) {
      setPickError(`Ese punto está fuera de ${NEIGHBORHOOD.name}. Elige uno dentro del contorno.`);
      return;
    }
    setPickError(null);
    setDraft(point);
    setMode("form");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setPickError("Tu navegador no permite obtener la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pick([pos.coords.latitude, pos.coords.longitude]),
      () => setPickError("No se pudo obtener tu ubicación. Toca el mapa en su lugar."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function cancel() {
    setDraft(null);
    setMode("view");
  }

  function submitted() {
    setDraft(null);
    setMode("view");
    setNotice("¡Gracias! Tu reporte será revisado antes de aparecer en el mapa.");
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Reportes {NEIGHBORHOOD.name}</h1>
          <p className="subtitle">{NEIGHBORHOOD.city}</p>
        </div>
        <a className="link-muted" href="/admin">
          Admin
        </a>
      </header>

      <nav className="filters" aria-label="Filtrar por categoría">
        {CATEGORY_KEYS.map((key) => {
          const cat = CATEGORIES[key];
          return (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={active.has(key)}
              onClick={() => toggle(key)}
              style={{ "--chip-color": cat.color } as React.CSSProperties}
            >
              <span className="dot" aria-hidden />
              {cat.label} <span className="chip__count">{counts[key]}</span>
            </button>
          );
        })}
        <label className="chip chip--check">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Ver resueltos
        </label>
      </nav>

      <section className="map-wrap">
        <ReportMap reports={visible} draft={draft} onPick={mode === "view" ? undefined : pick} />

        {mode === "pick" && (
          <div className="banner" role="status">
            <span>{pickError ?? "Toca el mapa donde está el problema"}</span>
            <div className="banner__actions">
              <button type="button" className="btn btn--ghost" onClick={useMyLocation}>
                Usar mi ubicación
              </button>
              <button type="button" className="btn btn--ghost" onClick={cancel}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {notice && mode === "view" && (
          <div className="toast" role="status">
            {notice}
            <button type="button" aria-label="Cerrar aviso" className="toast__close" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        {mode === "view" && (
          <button type="button" className="btn btn--primary fab" onClick={startReport}>
            + Reportar problema
          </button>
        )}
      </section>

      {mode === "form" && draft && (
        <ReportForm point={draft} onCancel={cancel} onRepick={() => setMode("pick")} onSubmitted={submitted} />
      )}
    </main>
  );
}
