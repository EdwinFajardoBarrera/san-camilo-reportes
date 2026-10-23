import { CATEGORIES, STATUS_LABELS } from "@/lib/config";
import { daysBetween, daysLabel, formatDate } from "@/lib/dates";
import type { Report } from "@/lib/types";

type Options = {
  showStatus: boolean;
  /** Si existe, se muestra el botón para marcar como arreglado (solo admin). */
  onMarkFixed?: (id: string) => Promise<void>;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Fila "etiqueta: valor" del globo. */
function row(label: string, value: string, className = "") {
  const r = el("div", `popup__row ${className}`.trim());
  r.append(el("span", "popup__label", label), el("span", "popup__value", value));
  return r;
}

/** Edad del reporte abierto: verde < 15 días, ámbar < 60, rojo después. */
function ageClass(days: number) {
  if (days < 15) return "age--fresh";
  if (days < 60) return "age--old";
  return "age--stale";
}

/**
 * Contenido del globo de información. Se construye con textContent (no innerHTML)
 * porque la descripción la escriben los vecinos.
 */
export function popupContent(report: Report, { showStatus, onMarkFixed }: Options): HTMLElement {
  const cat = CATEGORIES[report.category];
  const fixed = report.status === "resuelto" && report.resolvedAt;
  const root = el("div", "popup");
  root.style.setProperty("--chip-color", fixed ? "#16a34a" : cat.color);

  const head = el("div", "popup__head");
  head.append(el("span", "popup__icon", cat.icon), el("strong", "popup__title", cat.label));
  if (showStatus || fixed) head.append(el("span", `badge badge--${report.status}`, STATUS_LABELS[report.status]));
  root.append(head);

  if (report.reference) root.append(el("p", "popup__ref", report.reference));
  if (report.description) root.append(el("p", "popup__desc", report.description));

  const facts = el("div", "popup__facts");
  facts.append(row("Reportado", formatDate(report.createdAt)));
  if (fixed) {
    const took = daysBetween(report.createdAt, report.resolvedAt!);
    facts.append(
      row("Arreglado", formatDate(report.resolvedAt!)),
      row("Tardó", took === 0 ? "el mismo día" : daysLabel(took), "age--fixed"),
    );
  } else {
    const open = daysBetween(report.createdAt);
    facts.append(row("Sin arreglar", open === 0 ? "reportado hoy" : daysLabel(open), ageClass(open)));
  }
  root.append(facts);

  if (onMarkFixed && report.status === "aprobado") {
    const button = el("button", "btn btn--primary btn--small", "Marcar como arreglado");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Guardando…";
      try {
        await onMarkFixed(report.id);
      } catch {
        button.disabled = false;
        button.textContent = "No se pudo guardar. Reintentar";
      }
    });
    root.append(button);
  }
  return root;
}
