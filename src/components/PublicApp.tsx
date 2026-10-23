"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { markFixed } from "@/app/admin/actions";
import { CATEGORIES, CATEGORY_KEYS, NEIGHBORHOOD, categoryConfig, type Category, type LatLng } from "@/lib/config";
import { isPointInPolygon, type Line } from "@/lib/geo";
import type { Report } from "@/lib/types";
import { ReportMap } from "./MapLoader";
import type { MapApi } from "./ReportMap";
import { ReportForm, type StreetSelection } from "./ReportForm";

/** view: mapa · pick: elegir punto · form: formulario · draw: trazar calle a mano */
type Mode = "view" | "pick" | "form" | "draw";

const SUPPORTED_KEY = "sc-apoyos";

function readSupported(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SUPPORTED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function rememberSupported(id: string) {
  try {
    const ids = readSupported().add(id);
    localStorage.setItem(SUPPORTED_KEY, JSON.stringify([...ids]));
  } catch {
    // Sin almacenamiento local: solo no recordamos el apoyo en este navegador.
  }
}

// Espacio que ocupan los paneles flotantes sobre el mapa.
const MAP_PADDING = { top: 150, bottom: 90, left: 24, right: 24 };

type Props = { initialReports: Report[]; isAdmin: boolean; photosEnabled: boolean };

export function PublicApp({ initialReports, isAdmin, photosEnabled }: Props) {
  const router = useRouter();
  const mapApi = useRef<MapApi | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [street, setStreet] = useState<StreetSelection | null>(null);
  const [streetError, setStreetError] = useState<string | null>(null);
  const [manualLine, setManualLine] = useState<Line>([]);
  const [active, setActive] = useState<Set<Category>>(() => new Set(CATEGORY_KEYS));
  const [showResolved, setShowResolved] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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

  const isStreet = category ? (categoryConfig(category).isStreet ?? false) : false;

  function resetReport() {
    setDraft(null);
    setFormOpen(false);
    setCategory(null);
    setStreet(null);
    setStreetError(null);
    setManualLine([]);
    setPickError(null);
  }

  function startReport() {
    setNotice(null);
    resetReport();
    setMode("pick");
  }

  function detectStreet(point: LatLng) {
    const found = mapApi.current?.detectStreet(point);
    if (found) {
      setStreet({ ...found, manual: false });
      setStreetError(null);
    } else {
      setStreet(null);
      setStreetError("No encontramos una calle ahí. Toca justo sobre la calle o trázala a mano.");
    }
  }

  function pick(point: LatLng) {
    if (mode === "draw") {
      setManualLine((line) => [...line, [point[1], point[0]]]);
      return;
    }
    if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) {
      setPickError(`Ese punto está fuera de ${NEIGHBORHOOD.name}. Elige uno dentro del área marcada.`);
      return;
    }
    setPickError(null);
    setDraft(point);
    if (isStreet) detectStreet(point);
    setFormOpen(true);
    setMode("form");
  }

  function changeCategory(next: Category) {
    setCategory(next);
    if (categoryConfig(next).isStreet && !street && draft) detectStreet(draft);
  }

  function startDrawing() {
    setManualLine([]);
    setMode("draw");
  }

  function finishDrawing() {
    if (manualLine.length >= 2) {
      setStreet({ name: null, lines: [manualLine], manual: true });
      setStreetError(null);
    }
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
    resetReport();
    setMode("view");
  }

  function submitted() {
    resetReport();
    setMode("view");
    setSent(true);
  }

  async function handleSupport(id: string): Promise<number> {
    const res = await fetch(`/api/reports/${id}/support`, { method: "POST" });
    if (!res.ok) throw new Error("No se pudo registrar el apoyo");
    const { count } = (await res.json()) as { count: number };
    rememberSupported(id);
    router.refresh();
    return count;
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
        apiRef={mapApi}
        draft={isStreet ? null : draft}
        draftPath={mode === "draw" ? [manualLine] : isStreet ? street?.lines : null}
        focusPath={mode === "form"}
        onPick={mode === "pick" || mode === "draw" ? pick : undefined}
        onMarkFixed={isAdmin ? handleMarkFixed : undefined}
        onSupport={handleSupport}
        hasSupported={(id) => readSupported().has(id)}
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
              {pickError ?? (isStreet ? "Toca la calle sin pavimentar" : "Toca el mapa donde está el problema")}
            </span>
            <div className="banner__actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={useMyLocation}>
                📍 Mi ubicación
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={formOpen ? () => setMode("form") : cancel}
              >
                {formOpen ? "Volver" : "Cancelar"}
              </button>
            </div>
          </div>
        )}

        {mode === "draw" && (
          <div className="panel banner" role="status">
            <span>
              Toca puntos a lo largo de la calle
              <span className="optional"> · {manualLine.length} puntos</span>
            </span>
            <div className="banner__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setManualLine((l) => l.slice(0, -1))}
                disabled={manualLine.length === 0}
              >
                Deshacer
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setMode("form")}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={finishDrawing}
                disabled={manualLine.length < 2}
              >
                Listo
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

      {sent && (
        <div className="dialog-backdrop" onClick={() => setSent(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sent-title"
            aria-describedby="sent-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog__icon" aria-hidden>
              ✓
            </div>
            <h2 id="sent-title">¡Reporte enviado!</h2>
            <p id="sent-desc">
              Gracias por ayudar a la colonia. Tu reporte <strong>todavía no aparece en el mapa</strong>: primero lo
              revisa el administrador y, en cuanto lo apruebe, será visible para todos.
            </p>
            <button type="button" className="btn btn--primary" onClick={() => setSent(false)} autoFocus>
              Entendido
            </button>
          </div>
        </div>
      )}

      {formOpen && draft && (
        <ReportForm
          point={draft}
          category={category}
          onCategoryChange={changeCategory}
          street={street}
          streetError={streetError}
          onDrawStreet={startDrawing}
          onRepick={() => setMode("pick")}
          photosEnabled={photosEnabled}
          hidden={mode !== "form"}
          onCancel={cancel}
          onSubmitted={submitted}
        />
      )}
    </main>
  );
}
