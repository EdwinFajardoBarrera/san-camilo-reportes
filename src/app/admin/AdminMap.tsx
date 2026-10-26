"use client";

import { useEffect, useRef, useState } from "react";
import { ExpandPinsButton, useExpandedPins } from "@/components/ExpandPins";
import { LocateButton } from "@/components/LocateButton";
import { ReportMap } from "@/components/MapLoader";
import type { MapApi } from "@/components/ReportMap";
import { useUserLocation } from "@/components/useUserLocation";
import { NEIGHBORHOOD } from "@/lib/config";
import { isPointInPolygon } from "@/lib/geo";
import type { Report } from "@/lib/types";

/** Controles de la tarjeta que no deben mover el mapa al tocarlos. */
const INTERACTIVE = "button, a, input, select, textarea, label, summary, form";

/** Misma medida que el `@media` del panel en globals.css. */
const DESKTOP = "(min-width: 900px)";

function cardFor(id: string) {
  return document.querySelector<HTMLElement>(`[data-report-id="${CSS.escape(id)}"]`);
}

function select(card: HTMLElement) {
  document.querySelectorAll(".report--selected").forEach((el) => el.classList.remove("report--selected"));
  card.classList.add("report--selected");
}

/**
 * Al tocar un pin, resalta su tarjeta. En escritorio la lista de la derecha se
 * desplaza sola hasta ella; en el celular la página no se mueve (taparía el
 * globo) y el globo trae un botón «Ver en la lista».
 */
function selectFromMap(id: string) {
  const card = cardFor(id);
  if (!card) return;
  select(card);
  const list = card.closest<HTMLElement>(".admin__list");
  if (!list || !window.matchMedia(DESKTOP).matches) return;
  // Solo la lista, no la página: el mapa debe quedarse donde está.
  const box = list.getBoundingClientRect();
  const rect = card.getBoundingClientRect();
  const offset = rect.top - box.top - Math.max(16, (box.height - rect.height) / 2);
  list.scrollBy({ top: offset, behavior: "smooth" });
}

function showInList(id: string) {
  const card = cardFor(id);
  if (!card) return;
  select(card);
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Mapa del panel. Al tocar una tarjeta de reporte (`data-report-id`), el mapa
 * va a ese reporte y abre su globo; al tocar un pin, se resalta su tarjeta.
 * El admin puede ver cada marcador sin agrupar. `nearby` son reportes ya
 * aprobados cerca de los de la lista; se ven tenues, solo como referencia.
 */
export function AdminMap({
  reports,
  nearby,
  isAdmin = false,
}: {
  reports: Report[];
  nearby?: Report[];
  isAdmin?: boolean;
}) {
  const api = useRef<MapApi | null>(null);
  const { expanded, toggle } = useExpandedPins(isAdmin);
  const section = useRef<HTMLElement>(null);
  const { location, status: locationStatus, start: startLocation } = useUserLocation();
  const [notice, setNotice] = useState<string | null>(null);

  async function showMyLocation() {
    const loc = location ?? (await startLocation());
    if (!loc) return setNotice("No pudimos obtener tu ubicación. Revisa que el navegador tenga permiso.");
    if (!isPointInPolygon([loc.lat, loc.lng], NEIGHBORHOOD.polygon)) {
      return setNotice(`Parece que no estás en ${NEIGHBORHOOD.name}.`);
    }
    setNotice(null);
    api.current?.flyTo([loc.lat, loc.lng], Math.max(api.current.getZoom(), 17));
  }

  useEffect(() => {
    function focus(card: HTMLElement) {
      const id = card.dataset.reportId;
      if (!id) return;
      select(card);
      // En el celular el mapa queda arriba de la lista: subir a verlo.
      if (section.current && section.current.getBoundingClientRect().top < 0) {
        section.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      api.current?.focusReport(id);
    }
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(INTERACTIVE)) return;
      const card = target.closest<HTMLElement>("[data-report-id]");
      if (card) focus(card);
    }
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if ((e.key === "Enter" || e.key === " ") && target.matches("[data-report-id]")) {
        e.preventDefault();
        focus(target);
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <section ref={section} className="admin__map">
      <ReportMap
        reports={reports}
        showStatus
        apiRef={api}
        onSelect={selectFromMap}
        onShowInList={showInList}
        cluster={!expanded}
        faded={nearby}
        userLocation={location}
        controls={
          <>
            {isAdmin && <ExpandPinsButton expanded={expanded} onToggle={toggle} />}
            <LocateButton
              active={locationStatus === "on"}
              disabled={locationStatus === "searching"}
              onClick={showMyLocation}
            />
          </>
        }
      />
      {notice && (
        <div className="panel toast map-toast" role="status">
          {notice}
          <button type="button" aria-label="Cerrar aviso" className="toast__close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
    </section>
  );
}
