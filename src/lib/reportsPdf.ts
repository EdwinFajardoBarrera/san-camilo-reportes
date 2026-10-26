import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CATEGORIES, NEIGHBORHOOD, STATUS_LABELS, categoryConfig, type Status } from "./config";
import { agoLabel, daysBetween, daysLabel, localDay, TIME_ZONE } from "./dates";
import { pathLength } from "./geo";
import type { Report } from "./types";

// Lista de reportes en PDF para imprimir o compartir (p. ej. con el ayuntamiento).
// Se arma en el servidor con pdf-lib (MIT, sin servicios externos), así en el
// celular solo se descarga un archivo.

const PAGE = { width: 595.28, height: 841.89 }; // A4 en puntos
const MARGIN = 42;
const WIDTH = PAGE.width - 2 * MARGIN;
const BAR = 4; // franja de color de la categoría
const INDENT = BAR + 10;
const TEXT = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.42, 0.47);
const LINK = rgb(0.11, 0.38, 0.85);
const RULE = rgb(0.86, 0.86, 0.88);

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE });
const dateOnly = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: TIME_ZONE });

export const mapLink = (r: Pick<Report, "lat" | "lng">) =>
  `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=19/${r.lat}/${r.lng}`;

export function pdfFileName(status: Status, now = new Date()): string {
  return `reportes-${STATUS_LABELS[status].toLowerCase()}-${localDay(now)}.pdf`;
}

/**
 * Las fuentes estándar del PDF solo traen caracteres latinos (acentos y ñ sí,
 * emojis no). Lo que no se pueda escribir se quita para que el PDF no falle.
 */
export function sanitize(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text.replace(/[\t\r]/g, " "))
    .filter((ch) => ch === "\n" || supported.has(ch.codePointAt(0)!))
    .join("")
    .replace(/ {2,}/g, " ");
}

/** Parte el texto en renglones que quepan en el ancho dado. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ").filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palabras más largas que el renglón (p. ej. URLs) se cortan.
      line = "";
      for (const ch of word) {
        if (!fits(line + ch) && line) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

type Span = { text: string; font: PDFFont; size: number; color: typeof TEXT; gap: number; url?: string };

function reportSpans(r: Report, n: number, fonts: { regular: PDFFont; bold: PDFFont }): Span[] {
  const { regular, bold } = fonts;
  const line = (text: string, opts: Partial<Span> = {}): Span => ({
    text: sanitize(text, opts.font ?? regular),
    font: regular,
    size: 10,
    color: TEXT,
    gap: 3,
    ...opts,
  });
  const cat = categoryConfig(r.category);
  const spans: Span[] = [line(`${n}. ${cat.label} · ${STATUS_LABELS[r.status]}`, { font: bold, size: 12, gap: 5 })];

  let dates = `Reportado el ${dateTime.format(new Date(r.createdAt))}`;
  if (r.status === "resuelto" && r.resolvedAt) {
    const took = daysBetween(r.createdAt, r.resolvedAt);
    dates += ` · Arreglado el ${dateOnly.format(new Date(r.resolvedAt))} (${took === 0 ? "el mismo día" : `tardó ${daysLabel(took)}`})`;
  } else {
    dates += ` (${agoLabel(daysBetween(r.createdAt))})`;
  }
  spans.push(line(dates, { color: MUTED }));

  if (r.reference) spans.push(line(`Ubicación: ${r.reference}`));
  if (r.path) spans.push(line(`Calle marcada: aprox. ${Math.round(pathLength(r.path))} m`));
  spans.push(line(`Coordenadas: ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`));
  spans.push(line("Ver en el mapa (OpenStreetMap)", { color: LINK, url: mapLink(r) }));
  spans.push(line(`Reportado por: ${r.reporterName ?? "anónimo"}`));

  const counts: string[] = [];
  if (cat.supportLabel) counts.push(`Vecinos que apoyan: ${r.supportCount}`);
  counts.push(`Vecinos que dicen que ya se arregló: ${r.fixedVotes}`);
  spans.push(line(counts.join(" · ")));

  spans.push(
    r.description
      ? line(`Descripción: ${r.description}`, { gap: 3 })
      : line("Sin descripción", { color: MUTED }),
  );
  if (r.reviewedBy) spans.push(line(`Último cambio: ${r.reviewedBy}`, { color: MUTED, size: 9 }));
  return spans;
}

function addLink(page: PDFPage, doc: PDFDocument, url: string, x: number, y: number, w: number, h: number) {
  const annot = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }),
  );
  page.node.addAnnot(annot);
}

export async function buildReportsPdf(reports: Report[], status: Status, now = new Date()): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const title = `Reportes de ${NEIGHBORHOOD.name}: ${STATUS_LABELS[status]}`;
  doc.setTitle(title);
  doc.setLanguage("es-MX");
  doc.setCreator("San Camilo Reportes");

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const header = [
    { text: title, font: bold, size: 18, color: TEXT, gap: 6 },
    {
      text: `${NEIGHBORHOOD.city} · Generado el ${dateTime.format(now)} · ${reports.length} ${reports.length === 1 ? "reporte" : "reportes"}`,
      font: regular,
      size: 10,
      color: MUTED,
      gap: 14,
    },
  ];
  for (const h of header) {
    for (const text of wrap(sanitize(h.text, h.font), h.font, h.size, WIDTH)) {
      y -= h.size;
      page.drawText(text, { x: MARGIN, y, size: h.size, font: h.font, color: h.color });
      y -= 3;
    }
    y -= h.gap;
  }

  if (reports.length === 0) {
    page.drawText(sanitize(`No hay reportes en «${STATUS_LABELS[status]}».`, regular), {
      x: MARGIN,
      y: y - 12,
      size: 12,
      font: regular,
      color: MUTED,
    });
  }

  reports.forEach((r, i) => {
    const spans = reportSpans(r, i + 1, { regular, bold });
    const blocks = spans.map((s) => ({ ...s, lines: wrap(s.text, s.font, s.size, WIDTH - INDENT) }));
    const height = blocks.reduce((h, b) => h + b.lines.length * (b.size + b.gap), 0);
    const room = y - MARGIN - 20; // espacio para el pie de página
    // Si no cabe, el reporte pasa completo a la hoja siguiente (salvo que no
    // quepa ni en una hoja vacía: entonces se parte).
    if (height > room && y < PAGE.height - MARGIN - 40) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }

    const color = CATEGORIES[r.category].color;
    const barColor = rgb(...([1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16) / 255) as [number, number, number]));
    let barTop = y;
    for (const b of blocks) {
      for (const text of b.lines) {
        if (y - b.size < MARGIN + 20) {
          page.drawRectangle({ x: MARGIN, y, width: BAR, height: barTop - y, color: barColor });
          page = doc.addPage([PAGE.width, PAGE.height]);
          y = barTop = PAGE.height - MARGIN;
        }
        y -= b.size;
        page.drawText(text, { x: MARGIN + INDENT, y, size: b.size, font: b.font, color: b.color });
        if (b.url) {
          const w = b.font.widthOfTextAtSize(text, b.size);
          page.drawLine({ start: { x: MARGIN + INDENT, y: y - 1.5 }, end: { x: MARGIN + INDENT + w, y: y - 1.5 }, thickness: 0.5, color: b.color });
          addLink(page, doc, b.url, MARGIN + INDENT, y - 3, w, b.size + 4);
        }
        y -= b.gap;
      }
    }
    page.drawRectangle({ x: MARGIN, y, width: BAR, height: barTop - y, color: barColor });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 0.5, color: RULE });
    y -= 14;
  });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const text = `${NEIGHBORHOOD.name} · Página ${i + 1} de ${pages.length}`;
    const w = regular.widthOfTextAtSize(text, 8);
    p.drawText(sanitize(text, regular), { x: PAGE.width - MARGIN - w, y: MARGIN - 14, size: 8, font: regular, color: MUTED });
  });
  return doc.save();
}
