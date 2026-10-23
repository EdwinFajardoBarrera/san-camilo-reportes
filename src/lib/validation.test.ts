import { describe, expect, it } from "vitest";
import { newReportSchema } from "./validation";

const base = { category: "bache", lat: 20.9728205, lng: -89.552488 };

describe("newReportSchema", () => {
  it("acepta un reporte mínimo y normaliza textos vacíos a null", () => {
    const r = newReportSchema.parse({ ...base, description: "  ", reference: "" });
    expect(r.description).toBeNull();
    expect(r.reference).toBeNull();
  });

  it("recorta espacios", () => {
    expect(newReportSchema.parse({ ...base, reference: "  Calle 47  " }).reference).toBe("Calle 47");
  });

  it("rechaza categorías desconocidas", () => {
    expect(newReportSchema.safeParse({ ...base, category: "otro" }).success).toBe(false);
  });

  it("rechaza puntos fuera de la colonia", () => {
    expect(newReportSchema.safeParse({ ...base, lat: 21.0 }).success).toBe(false);
  });

  it("rechaza descripciones demasiado largas", () => {
    expect(newReportSchema.safeParse({ ...base, description: "a".repeat(501) }).success).toBe(false);
  });

  it("rechaza envíos con el campo trampa lleno", () => {
    expect(newReportSchema.safeParse({ ...base, website: "spam.com" }).success).toBe(false);
  });
});

describe("reportes de calles", () => {
  const street = [
    [-89.56, 20.972],
    [-89.555, 20.972],
    [-89.55, 20.972],
  ];

  it("exige el trazo de la calle", () => {
    expect(newReportSchema.safeParse({ category: "sin_pavimentar", lat: 20.972, lng: -89.555 }).success).toBe(false);
  });

  it("calcula el punto del pin a partir del trazo", () => {
    const r = newReportSchema.parse({ category: "sin_pavimentar", path: [street] });
    expect([r.lat, r.lng]).toEqual([20.972, -89.555]);
    expect(r.path).toHaveLength(1);
  });

  it("rechaza trazos lejos de la colonia", () => {
    expect(newReportSchema.safeParse({ category: "sin_pavimentar", path: [[[-89.7, 20.9], [-89.69, 20.9]]] }).success).toBe(false);
  });

  it("ignora el trazo en reportes de un solo punto", () => {
    expect(newReportSchema.parse({ ...base, path: [street] }).path).toBeNull();
  });
});

describe("nombre del vecino", () => {
  it("es opcional y se recorta", () => {
    expect(newReportSchema.parse(base).reporterName).toBeNull();
    expect(newReportSchema.parse({ ...base, reporterName: "  Edwin  " }).reporterName).toBe("Edwin");
  });

  it("limita el largo", () => {
    expect(newReportSchema.safeParse({ ...base, reporterName: "a".repeat(61) }).success).toBe(false);
  });
});
