"use client";

import { useEffect, useRef } from "react";
import { ReportMap } from "@/components/MapLoader";
import type { MapApi } from "@/components/ReportMap";
import type { Report } from "@/lib/types";

/** Controles de la tarjeta que no deben mover el mapa al tocarlos. */
const INTERACTIVE = "button, a, input, select, textarea, label, summary, form";

/**
 * Mapa del panel. Al tocar una tarjeta de reporte (`data-report-id`), el mapa
 * va a ese reporte y abre su globo.
 */
export function AdminMap({ reports }: { reports: Report[] }) {
  const api = useRef<MapApi | null>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    function focus(card: HTMLElement) {
      const id = card.dataset.reportId;
      if (!id) return;
      document.querySelectorAll(".report--selected").forEach((el) => el.classList.remove("report--selected"));
      card.classList.add("report--selected");
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
      <ReportMap reports={reports} showStatus apiRef={api} />
    </section>
  );
}
