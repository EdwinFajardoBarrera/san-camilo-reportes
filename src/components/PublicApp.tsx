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

/**
 * Flujo de reporte pensado para el celular:
 * choose (qué es) → locate (mover el mapa bajo la mira) → form (detalles) → enviar.
 * draw: trazar una calle a mano tocando puntos.
 */
type Mode = "view" | "choose" | "locate" | "form" | "draw";

// Espacio que ocupan los paneles flotantes sobre el mapa.
const MAP_PADDING = { top: 150, bottom: 90, left: 24, right: 24 };
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
    localStorage.setItem(SUPPORTED_KEY, JSON.stringify([...readSupported().add(id)]));
  } catch {
    // Sin almacenamiento local: solo no recordamos el apoyo en este navegador.
  }
}

type Props = { initialReports: Report[]; isAdmin: boolean; photosEnabled: boolean };

export function PublicApp({ initialReports, isAdmin, photosEnabled }: Props) {
  const router = useRouter();
  const mapApi = useRef<MapApi | null>(null);
  const [active, setActive] = useState<Set<Category>>(() => new Set(CATEGORY_KEYS));
  const [showResolved, setShowResolved] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [category, setCategory] = useState<Category | null>(null);
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [street, setStreet] = useState<StreetSelection | null>(null);
  const [manualLine, setManualLine] = useState<Line>([]);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isStreet = category ? (categoryConfig(category).isStreet ?? false) : false;

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

  function reset() {
    setCategory(null);
    setDraft(null);
    setStreet(null);
    setManualLine([]);
    setLocateError(null);
  }

  function startReport() {
    setNotice(null);
    reset();
    setMode("choose");
  }

  function chooseCategory(next: Category) {
    setCategory(next);
    setStreet(null);
    setLocateError(null);
    setMode("locate");
    // Acercar para ubicar con precisión.
    const api = mapApi.current;
    if (api && api.getZoom() < 16.5) api.flyTo(api.getCenter(), 17);
  }

  /** Confirma el punto bajo la mira. */
  function confirmLocation() {
    const api = mapApi.current;
    if (!api) return;
    const point = api.getCenter();
    if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) {
      setLocateError(`Ese punto está fuera de ${NEIGHBORHOOD.name}. Mueve el mapa al área marcada.`);
      return;
    }
    if (isStreet) {
      const found = api.detectStreet(point);
      if (!found) {
        setLocateError("No encontramos una calle bajo la mira. Acércala a la calle o trázala a mano.");
        return;
      }
      setStreet({ ...found, manual: false });
    }
    setLocateError(null);
    setDraft(point);
    setMode("form");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Tu celular no permite obtener la ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const point: LatLng = [pos.coords.latitude, pos.coords.longitude];
        if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) {
          setLocateError(`Parece que no estás en ${NEIGHBORHOOD.name}. Mueve el mapa hasta el problema.`);
          return;
        }
        setLocateError(null);
        mapApi.current?.flyTo(point);
      },
      () => {
        setLocating(false);
        setLocateError("No pudimos obtener tu ubicación. Mueve el mapa hasta el problema.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function startDrawing() {
    setManualLine([]);
    setLocateError(null);
    setMode("draw");
  }

  function addDrawPoint(point: LatLng) {
    setManualLine((line) => [...line, [point[1], point[0]]]);
  }

  function finishDrawing() {
    if (manualLine.length < 2) return;
    const [lng, lat] = manualLine[Math.floor(manualLine.length / 2)];
    setStreet({ name: null, lines: [manualLine], manual: true });
    setDraft((d) => d ?? [lat, lng]);
    setMode("form");
  }

  function cancel() {
    reset();
    setMode("view");
  }

  function submitted() {
    reset();
    setMode("view");
    setSent(true);
  }

  async function handleMarkFixed(id: string) {
    await markFixed(id);
    setNotice("Reporte marcado como arreglado.");
    router.refresh();
  }

  async function handleSupport(id: string): Promise<number> {
    const res = await fetch(`/api/reports/${id}/support`, { method: "POST" });
    if (!res.ok) throw new Error("No se pudo registrar el apoyo");
    const { count } = (await res.json()) as { count: number };
    rememberSupported(id);
    router.refresh();
    return count;
  }

  const reporting = mode !== "view";
  const cat = category ? CATEGORIES[category] : null;

  return (
    <main className={`app${reporting ? " app--reporting" : ""}`}>
      <ReportMap
        reports={visible}
        apiRef={mapApi}
        draft={!isStreet && mode === "form" ? draft : null}
        draftPath={mode === "draw" ? [manualLine] : isStreet && mode === "form" ? street?.lines : null}
        focusPath={mode === "form"}
        onPick={mode === "draw" ? addDrawPoint : undefined}
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

        {!reporting && (
          <nav className="filters" aria-label="Filtrar por categoría">
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="chip"
                aria-pressed={active.has(key)}
                onClick={() => toggle(key)}
                style={{ "--chip-color": CATEGORIES[key].color } as React.CSSProperties}
              >
                <span aria-hidden>{CATEGORIES[key].icon}</span>
                {CATEGORIES[key].label}
                <span className="chip__count">{counts[key]}</span>
              </button>
            ))}
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

      {/* Paso 1: qué se reporta */}
      {mode === "choose" && (
        <section className="sheet sheet--compact" aria-labelledby="choose-title">
          <div className="sheet__head">
            <h2 id="choose-title">¿Qué quieres reportar?</h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={cancel}>
              Cancelar
            </button>
          </div>
          <div className="choices">
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="choice"
                onClick={() => chooseCategory(key)}
                style={{ "--chip-color": CATEGORIES[key].color } as React.CSSProperties}
              >
                <span className="choice__icon" aria-hidden>
                  {CATEGORIES[key].icon}
                </span>
                {CATEGORIES[key].label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Paso 2: ubicar con la mira al centro */}
      {mode === "locate" && cat && (
        <>
          <div className={`crosshair${isStreet ? " crosshair--street" : ""}`} aria-hidden>
            <span className="crosshair__pin" style={{ "--chip-color": cat.color } as React.CSSProperties}>
              <span>{cat.icon}</span>
            </span>
          </div>
          <section className="sheet sheet--compact" aria-live="polite">
            <p className="step">
              <span className="step__badge" style={{ "--chip-color": cat.color } as React.CSSProperties}>
                {cat.icon} {cat.label}
              </span>
              <button type="button" className="link-button" onClick={() => setMode("choose")}>
                Cambiar
              </button>
            </p>
            <p className={locateError ? "error" : "hint hint--left"}>
              {locateError ??
                (isStreet
                  ? "Mueve el mapa hasta que la mira quede sobre la calle sin pavimentar."
                  : "Mueve el mapa hasta que la mira quede justo sobre el problema.")}
            </p>
            <div className="locate-actions">
              <button type="button" className="btn btn--ghost btn--big" onClick={useMyLocation} disabled={locating}>
                {locating ? "Buscando…" : "📍 Mi ubicación"}
              </button>
              <button type="button" className="btn btn--primary btn--big" onClick={confirmLocation}>
                {isStreet ? "Elegir esta calle" : "Confirmar ubicación"}
              </button>
            </div>
            <div className="locate-footer">
              <button type="button" className="link-button" onClick={cancel}>
                Cancelar
              </button>
              {isStreet && (
                <button type="button" className="link-button" onClick={startDrawing}>
                  ✏️ Prefiero trazarla a mano
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {/* Trazo a mano */}
      {mode === "draw" && (
        <section className="sheet sheet--compact" aria-live="polite">
          <p className="hint hint--left">
            Toca el mapa a lo largo de la calle, de una esquina a la otra.{" "}
            <strong>{manualLine.length} puntos</strong>
          </p>
          <div className="locate-actions">
            <button
              type="button"
              className="btn btn--ghost btn--big"
              onClick={() => setManualLine((l) => l.slice(0, -1))}
              disabled={manualLine.length === 0}
            >
              ↶ Deshacer
            </button>
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={finishDrawing}
              disabled={manualLine.length < 2}
            >
              Listo
            </button>
          </div>
          <div className="locate-footer">
            <button type="button" className="link-button" onClick={() => setMode("locate")}>
              Volver
            </button>
          </div>
        </section>
      )}

      {/* Paso 3: detalles y envío. Se mantiene montado para no perder lo escrito. */}
      {category && draft && mode !== "view" && (
        <ReportForm
          point={draft}
          category={category}
          street={street}
          photosEnabled={photosEnabled}
          hidden={mode !== "form"}
          onChangeLocation={() => setMode("locate")}
          onCancel={cancel}
          onSubmitted={submitted}
        />
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
    </main>
  );
}
