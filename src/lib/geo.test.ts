import { describe, expect, it } from "vitest";
import { NEIGHBORHOOD } from "./config";
import { clipLinesToPolygon, distanceToLine, isPointInPolygon, paddedBounds, pathLength, representativePoint, type Line } from "./geo";

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

describe("líneas", () => {
  // Calle horizontal que entra y sale de la colonia.
  const street: Line = [
    [-89.58, 20.972],
    [-89.56, 20.972],
    [-89.555, 20.972],
    [-89.55, 20.972],
    [-89.52, 20.972],
  ];

  it("recorta al polígono y quita duplicados", () => {
    const clipped = clipLinesToPolygon([street, street], NEIGHBORHOOD.polygon);
    expect(clipped).toEqual([[[-89.56, 20.972], [-89.555, 20.972], [-89.55, 20.972]]]);
  });

  it("descarta líneas fuera de la colonia", () => {
    expect(clipLinesToPolygon([[[-89.6, 20.9], [-89.59, 20.9]]], NEIGHBORHOOD.polygon)).toEqual([]);
  });

  it("mide distancias y longitudes en metros", () => {
    // ~111 m por milésima de grado de latitud.
    expect(distanceToLine([20.973, -89.555], street)).toBeGreaterThan(105);
    expect(distanceToLine([20.973, -89.555], street)).toBeLessThan(115);
    expect(pathLength([[[-89.555, 20.97], [-89.555, 20.971]]])).toBeCloseTo(111.3, 0);
  });

  it("elige un punto representativo dentro de la colonia", () => {
    expect(representativePoint([street], NEIGHBORHOOD.polygon)).toEqual([20.972, -89.555]);
    expect(representativePoint([[[-89.6, 20.9], [-89.59, 20.9]]], NEIGHBORHOOD.polygon)).toBeNull();
  });
});
