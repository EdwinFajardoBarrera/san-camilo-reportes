import { describe, expect, it } from "vitest";
import { NEIGHBORHOOD } from "./config";
import { isPointInPolygon, paddedBounds } from "./geo";

describe("isPointInPolygon", () => {
  const poly = NEIGHBORHOOD.polygon;

  it("acepta puntos dentro de la colonia", () => {
    expect(isPointInPolygon([20.9728205, -89.552488], poly)).toBe(true);
    expect(isPointInPolygon([20.9668385, -89.5526309], poly)).toBe(true);
  });

  it("rechaza puntos fuera de la colonia", () => {
    expect(isPointInPolygon([20.99, -89.55], poly)).toBe(false); // al norte
    expect(isPointInPolygon([20.975, -89.58], poly)).toBe(false); // al poniente del Periférico
    expect(isPointInPolygon([20.963, -89.541], poly)).toBe(false); // esquina sureste, fuera de la diagonal
  });
});

describe("paddedBounds", () => {
  it("contiene todos los vértices", () => {
    const [[s, w], [n, e]] = paddedBounds(NEIGHBORHOOD.polygon);
    for (const [lat, lng] of NEIGHBORHOOD.polygon) {
      expect(lat).toBeGreaterThan(s);
      expect(lat).toBeLessThan(n);
      expect(lng).toBeGreaterThan(w);
      expect(lng).toBeLessThan(e);
    }
  });
});
