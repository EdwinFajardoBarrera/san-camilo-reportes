"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { markFixed } from "@/app/admin/actions";
import { CATEGORIES, CATEGORY_KEYS, NEIGHBORHOOD, categoryConfig, type Category, type LatLng } from "@/lib/config";
import { isPointInPolygon, type Line } from "@/lib/geo";
import type { Report } from "@/lib/types";
import { ExpandPinsButton, useExpandedPins } from "./ExpandPins";
import { ReportMap } from "./MapLoader";
import type { MapApi } from "./ReportMap";
import { ReportForm, type StreetSelection } from "./ReportForm";
import { LocateButton } from "./LocateButton";
import { useUserLocation, type UserLocation } from "./useUserLocation";

/**
 * Flujo de reporte pensado para el celular:
 * choose (qué es) → locate (mover el mapa bajo la mira) → form (detalles) → enviar.
 * draw: trazar una calle a mano tocando puntos.
 */
type Mode = "view" | "choose" | "locate" | "form" | "draw";

// Espacio que ocupan los paneles flotantes sobre el mapa.
const MAP_PADDING = { top: 150, bottom: 90, left: 24, right: 24 };
const SUPPORTED_KEY = "sc-apoyos";
const FIXED_VOTED_KEY = "sc-arreglados";

/** Paso al que regresa el botón "atrás" del celular. */
const PREVIOUS: Record<Mode, Mode> = { view: "view", choose: "view", locate: "choose", form: "locate", draw: "locate" };

/** Reportes que este navegador ya apoyó o marcó como arreglados. */
function readIds(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function rememberId(key: string, id: string) {
  try {
    localStorage.setItem(key, JSON.stringify([...readIds(key).add(id)]));
  } catch {
    // Sin almacenamiento local: solo no lo recordamos en este navegador.
  }
}

const readSupported = () => readIds(SUPPORTED_KEY);

type Props = { initialReports: Report[]; isStaff: boolean; isAdmin: boolean; photosEnabled: boolean };

export function PublicApp({ initialReports, isStaff, isAdmin, photosEnabled }: Props) {
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
  const { location: userLocation, status: locationStatus, start: startLocation } = useUserLocation();
  const locating = locationStatus === "searching";
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Solo el admin puede ver cada marcador por separado en lugar de los círculos con número.
  const { expanded, toggle: toggleExpanded } = useExpandedPins(isAdmin);

  const modeRef = useRef(mode);
  const sentRef = useRef(sent);
  useEffect(() => {
    modeRef.current = mode;
    sentRef.current = sent;
  }, [mode, sent]);

  // Mientras se reporta (o se ve el aviso de enviado) hay una entrada extra en el historial,
  // así el botón "atrás" de Android regresa un paso en lugar de salir de la página.
  const inFlow = mode !== "view" || sent;
  useEffect(() => {
    const marked = window.history.state?.scReport === true;
    if (inFlow && !marked) window.history.pushState({ ...window.history.state, scReport: true }, "");
    if (!inFlow && marked) window.history.back();
  }, [inFlow, mode]);

  useEffect(() => {
    function onBack() {
      if (sentRef.current) {
        setSent(false);
        return;
      }
      const prev = PREVIOUS[modeRef.current];
      if (prev === modeRef.current) return;
      if (prev === "view") {
        setCategory(null);
        setDraft(null);
        setStreet(null);
        setManualLine([]);
      }
      setLocateError(null);
      setMode(prev);
    }
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

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
    let point = api.getCenter();
    if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) {
      setLocateError(`Ese punto está fuera de ${NEIGHBORHOOD.name}. Mueve el mapa al área marcada.`);
      return;
    }
    if (!isStreet) {
      // El problema debe estar en la calle: se acomoda el pin sobre la más cercana.
      const onStreet = api.snapToStreet(point);
      if (!onStreet) {
        setLocateError("La mira no está sobre una calle. Muévela hasta la calle donde está el problema.");
        return;
      }
      point = onStreet;
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

  /** Centra el mapa en el punto azul si está dentro de la colonia. */
  function flyToLocation(loc: UserLocation): boolean {
    const point: LatLng = [loc.lat, loc.lng];
    if (!isPointInPolygon(point, NEIGHBORHOOD.polygon)) return false;
    mapApi.current?.flyTo(point, Math.max(mapApi.current.getZoom(), 17));
    return true;
  }

  function locationProblem(): string {
    if (locationStatus === "denied")
      return "No diste permiso de ubicación. Actívalo en los ajustes del navegador o mueve el mapa a mano.";
    return "No pudimos obtener tu ubicación. Mueve el mapa hasta el problema.";
  }

  async function useMyLocation() {
    const loc = userLocation ?? (await startLocation());
    if (!loc) return setLocateError(locationProblem());
    if (!flyToLocation(loc)) {
      return setLocateError(`Parece que no estás en ${NEIGHBORHOOD.name}. Mueve el mapa hasta el problema.`);
    }
    setLocateError(null);
  }

  async function showMyLocation() {
    const loc = userLocation ?? (await startLocation());
    if (!loc) return setNotice(locationProblem());
    if (!flyToLocation(loc)) setNotice(`Parece que no estás en ${NEIGHBORHOOD.name}.`);
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

  /** El vecino confirmó que ya estaba reportado: no se envía y se le muestra el existente. */
  async function handleDuplicate(existing: Report) {
    reset();
    setMode("view");
    mapApi.current?.flyTo([existing.lat, existing.lng], 18);
    if (!categoryConfig(existing.category).supportLabel) {
      setNotice("Gracias. Ese problema ya está reportado; te lo mostramos en el mapa.");
      return;
    }
    if (readSupported().has(existing.id)) {
      setNotice("Ya habías apoyado ese reporte. Te lo mostramos en el mapa.");
      return;
    }
    try {
      await handleSupport(existing.id);
      setNotice("Gracias. Sumamos tu apoyo al reporte que ya existía.");
    } catch {
      setNotice("Ese problema ya está reportado. Toca su marcador para apoyarlo.");
    }
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
    rememberId(SUPPORTED_KEY, id);
    router.refresh();
    return count;
  }

  async function handleFixedVote(id: string): Promise<number> {
    const res = await fetch(`/api/reports/${id}/fixed`, { method: "POST" });
    if (!res.ok) throw new Error("No se pudo registrar el aviso");
    const { count } = (await res.json()) as { count: number };
    rememberId(FIXED_VOTED_KEY, id);
    router.refresh();
    return count;
  }

  const reporting = mode !== "view";
  const cat = category ? CATEGORIES[category] : null;

  // Botones redondos que se apilan encima del zoom del mapa.
  const mapControls = mode === "view" && (
    <>
      {isAdmin && <ExpandPinsButton expanded={expanded} onToggle={toggleExpanded} />}
      <LocateButton active={locationStatus === "on"} disabled={locating} onClick={showMyLocation} />
    </>
  );

  return (
    <main className={`app${reporting ? " app--reporting" : ""}`}>
      <ReportMap
        reports={visible}
        apiRef={mapApi}
        draft={!isStreet && mode === "form" ? draft : null}
        draftPath={mode === "draw" ? [manualLine] : isStreet && mode === "form" ? street?.lines : null}
        focusPath={mode === "form"}
        onPick={mode === "draw" ? addDrawPoint : undefined}
        onMarkFixed={isStaff ? handleMarkFixed : undefined}
        onSupport={handleSupport}
        hasSupported={(id) => readSupported().has(id)}
        onFixedVote={isStaff ? undefined : handleFixedVote}
        hasFixedVoted={(id) => readIds(FIXED_VOTED_KEY).has(id)}
        padding={MAP_PADDING}
        userLocation={userLocation}
        cluster={!expanded}
        controls={mapControls}
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
          {/* Solo para el equipo ya autenticado; para entrar se va directo a /admin. */}
          {isStaff && (
            <a className="icon-link" href="/admin" aria-label="Panel de administración" title="Administración">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z"
                />
              </svg>
            </a>
          )}
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
          published={initialReports}
          onDuplicate={handleDuplicate}
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
