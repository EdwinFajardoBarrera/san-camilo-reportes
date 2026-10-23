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
