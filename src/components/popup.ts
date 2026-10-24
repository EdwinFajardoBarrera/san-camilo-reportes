import { CATEGORIES, STATUS_LABELS, categoryConfig } from "@/lib/config";
import { daysBetween, daysLabel, formatDate } from "@/lib/dates";
import type { Report } from "@/lib/types";

type Options = {
  showStatus: boolean;
  /** Si existe, se muestra el botón para marcar como arreglado (solo admin). */
  onMarkFixed?: (id: string) => Promise<void>;
  /** Apoyar la iniciativa; devuelve el nuevo total de apoyos. */
  onSupport?: (id: string) => Promise<number>;
  /** Si este navegador ya apoyó el reporte. */
  supported?: boolean;
  /** Avisar que ya se arregló; devuelve el nuevo total de avisos. */
  onFixedVote?: (id: string) => Promise<number>;
  /** Si este navegador ya avisó que se arregló. */
  fixedVoted?: boolean;
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
export function popupContent(
  report: Report,
  { showStatus, onMarkFixed, onSupport, supported, onFixedVote, fixedVoted }: Options,
): HTMLElement {
  const cat = CATEGORIES[report.category];
  const fixed = report.status === "resuelto" && report.resolvedAt;
  const root = el("div", "popup");
  root.style.setProperty("--chip-color", fixed ? "#16a34a" : cat.color);

  const head = el("div", "popup__head");
  head.append(el("span", "popup__icon", cat.icon), el("strong", "popup__title", cat.label));
  if (showStatus || fixed) head.append(el("span", `badge badge--${report.status}`, STATUS_LABELS[report.status]));
  root.append(head);

  if (report.photoUrl) {
    const link = el("a", "popup__photo");
    link.href = report.photoUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    const img = el("img");
    img.src = report.photoUrl;
    img.alt = `Foto del reporte: ${cat.label}`;
    img.loading = "lazy";
    link.append(img);
    root.append(link);
  }

  if (report.reference) root.append(el("p", "popup__ref", report.reference));
  if (report.description) root.append(el("p", "popup__desc", report.description));

  const facts = el("div", "popup__facts");
  facts.append(row("Reportado", formatDate(report.createdAt)));
  facts.append(row("Por", report.reporterName ?? "Vecino anónimo"));
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

  const supportLabel = categoryConfig(report.category).supportLabel;
  if (supportLabel) {
    const box = el("div", "support");
    const count = el("span", "support__count");
    const setCount = (n: number) => {
      count.textContent = n === 1 ? "1 vecino apoya" : `${n} vecinos apoyan`;
    };
    setCount(report.supportCount);
    box.append(count);
    if (onSupport && report.status === "aprobado") {
      const button = el("button", "btn btn--support btn--small");
      button.type = "button";
      const markDone = () => {
        button.disabled = true;
        button.textContent = "✓ Ya apoyas";
      };
      if (supported) markDone();
      else button.textContent = `👍 ${supportLabel}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          setCount(await onSupport(report.id));
          markDone();
        } catch {
          button.disabled = false;
          button.textContent = "No se pudo. Reintentar";
        }
      });
      box.append(button);
    }
    root.append(box);
  }

  if (report.status === "aprobado" && (onFixedVote || report.fixedVotes > 0)) {
    const box = el("div", "fixed-vote");
    const count = el("span", "fixed-vote__count");
    const setCount = (n: number) => {
      count.textContent = n === 0 ? "" : n === 1 ? "1 vecino dice que ya se arregló" : `${n} vecinos dicen que ya se arregló`;
      count.hidden = n === 0;
    };
    setCount(report.fixedVotes);
    box.append(count);
    if (onFixedVote) {
      const button = el("button", "btn btn--fixed-vote btn--small");
      button.type = "button";
      const markDone = () => {
        button.disabled = true;
        button.textContent = "✓ Gracias, avisamos al equipo";
      };
      if (fixedVoted) markDone();
      else button.textContent = "✅ Ya lo arreglaron";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          setCount(await onFixedVote(report.id));
          markDone();
        } catch {
          button.disabled = false;
          button.textContent = "No se pudo. Reintentar";
        }
      });
      box.append(button);
    }
    root.append(box);
  }

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
