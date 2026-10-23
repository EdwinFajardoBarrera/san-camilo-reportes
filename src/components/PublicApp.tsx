"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { markFixed } from "@/app/admin/actions";
import { CATEGORIES, CATEGORY_KEYS, NEIGHBORHOOD, type Category, type LatLng } from "@/lib/config";
import { isPointInPolygon } from "@/lib/geo";
import type { Report } from "@/lib/types";
import { ReportMap } from "./MapLoader";
import { ReportForm } from "./ReportForm";

type Mode = "view" | "pick" | "form";

// Espacio que ocupan los paneles flotantes sobre el mapa.
const MAP_PADDING = { top: 150, bottom: 90, left: 24, right: 24 };

export function PublicApp({ initialReports, isAdmin }: { initialReports: Report[]; isAdmin: boolean }) {
  const router = useRouter();
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
  const fixedCount = initialReports.length - Object.values(counts).reduce((a, b) => a + b, 0);

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
      setPickError(`Ese punto está fuera de ${NEIGHBORHOOD.name}. Elige uno dentro del área marcada.`);
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

  async function handleMarkFixed(id: string) {
    await markFixed(id);
    setNotice("Reporte marcado como arreglado.");
    router.refresh();
  }

  return (
    <main className="app">
      <ReportMap
        reports={visible}
        draft={draft}
        onPick={mode === "view" ? undefined : pick}
        onMarkFixed={isAdmin ? handleMarkFixed : undefined}
        padding={MAP_PADDING}
      />

      <div className="overlay-top">
        <header className="panel brand">
          <span className="brand__logo" aria-hidden>
            SC
          </span>
          <div className="brand__text">
            <h1>Reportes {NEIGHBORHOOD.name}</h1>
            <p>
              {visible.length} {visible.length === 1 ? "problema" : "problemas"} en el mapa · {NEIGHBORHOOD.city}
            </p>
          </div>
          <a className="icon-link" href="/admin" aria-label="Panel de administración" title="Administración">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z"
              />
            </svg>
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
                <span aria-hidden>{cat.icon}</span>
                {cat.label}
                <span className="chip__count">{counts[key]}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="chip"
            aria-pressed={showResolved}
            onClick={() => setShowResolved((v) => !v)}
            style={{ "--chip-color": "#16a34a" } as React.CSSProperties}
          >
            <span aria-hidden>✅</span>
            Arreglados
            <span className="chip__count">{fixedCount}</span>
          </button>
        </nav>

        {mode === "pick" && (
          <div className="panel banner" role="status">
            <span className={pickError ? "error" : undefined}>
              {pickError ?? "Toca el mapa donde está el problema"}
            </span>
            <div className="banner__actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={useMyLocation}>
                📍 Mi ubicación
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={cancel}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {notice && mode === "view" && (
          <div className="panel toast" role="status">
            {notice}
            <button type="button" aria-label="Cerrar aviso" className="toast__close" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      {mode === "view" && (
        <button type="button" className="btn btn--primary fab" onClick={startReport}>
          <span aria-hidden>＋</span> Reportar problema
        </button>
      )}

      {mode === "form" && draft && (
        <ReportForm point={draft} onCancel={cancel} onRepick={() => setMode("pick")} onSubmitted={submitted} />
      )}
    </main>
  );
}
