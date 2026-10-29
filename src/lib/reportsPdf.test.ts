import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildReportsPdf, pdfFileName, sanitize, wrap } from "./reportsPdf";
import type { Report } from "./types";

const report = (i: number, extra: Partial<Report> = {}): Report => ({
  id: `id-${i}`,
  category: "bache",
  status: "aprobado",
  description: "Bache grande frente a la tienda 🕳️, ¿cuándo lo arreglan? Año pasado también.",
  reference: "Calle 21 x 34",
  lat: 20.97,
  lng: -89.55,
  createdAt: "2026-10-20T15:00:00Z",
  resolvedAt: null,
  path: null,
  photoUrl: null,
  evidenceUrl: null,
  reporterName: null,
  supportCount: 0,
  fixedVotes: 2,
  ...extra,
});

describe("PDF de reportes", () => {
  it("quita lo que la fuente no puede escribir y conserva acentos", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(sanitize("Año ¿ñandú? 🚧 «ok»", font)).toBe("Año ¿ñandú? «ok»");
  });

  it("parte el texto en renglones que caben", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrap("uno dos tres cuatro cinco seis\nsiete " + "x".repeat(200), font, 10, 100);
    expect(lines.length).toBeGreaterThan(4);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(100);
  });

  it("genera varias páginas con todos los reportes", async () => {
    const reports = Array.from({ length: 40 }, (_, i) =>
      report(i, i % 3 === 0 ? { category: "sin_pavimentar", path: [[[-89.55, 20.97], [-89.551, 20.971]]], supportCount: 5, reporterName: "Doña Pía" } : {}),
    );
    const bytes = await buildReportsPdf(reports, "aprobado", new Date("2026-10-26T12:00:00Z"));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(doc.getTitle()).toBe("Reportes de San Camilo: Aprobado");
  });

  it("genera un PDF aunque no haya reportes", async () => {
    const doc = await PDFDocument.load(await buildReportsPdf([], "pendiente"));
    expect(doc.getPageCount()).toBe(1);
  });

  it("nombra el archivo con el estado y el día en Yucatán", () => {
    expect(pdfFileName("resuelto", new Date("2026-10-27T03:00:00Z"))).toBe("reportes-arreglado-2026-10-26.pdf");
  });
});
