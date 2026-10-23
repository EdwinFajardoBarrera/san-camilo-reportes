import { describe, expect, it } from "vitest";
import { blockAround, mergeLines, overlaps } from "./streets";
import type { Line } from "./geo";

// Calle "47" de oeste a este con cruces (calles norte-sur) en -89.556, -89.554 y -89.552.
const LAT = 20.972;
const calle47: Line[] = [
  // Cortada en dos mosaicos en -89.555.
  [[-89.558, LAT], [-89.556, LAT], [-89.555, LAT]],
  [[-89.555, LAT], [-89.554, LAT], [-89.552, LAT], [-89.55, LAT]],
];
const cruce = (lng: number): Line => [[lng, LAT - 0.001], [lng, LAT], [lng, LAT + 0.001]];
const others = [cruce(-89.556), cruce(-89.554), cruce(-89.552)];

describe("blockAround", () => {
  it("recorta a la cuadra entre los dos cruces más cercanos", () => {
    const block = blockAround([LAT, -89.5548], calle47, others)!;
    expect(block[0][0]).toBeCloseTo(-89.556, 5);
    expect(block[block.length - 1][0]).toBeCloseTo(-89.554, 5);
    block.forEach(([, lat]) => expect(lat).toBeCloseTo(LAT, 6));
  });

  it("corta en un cruce que no es vértice de la calle", () => {
    const block = blockAround([LAT, -89.5535], calle47, [cruce(-89.553)])!;
    const lngs = block.map(([lng]) => lng);
    expect(Math.max(...lngs)).toBeCloseTo(-89.553, 5);
    expect(Math.min(...lngs)).toBeCloseTo(-89.558, 5); // sin cruce al poniente: hasta el extremo
  });

  it("devuelve null sin calle", () => {
    expect(blockAround([LAT, -89.555], [], others)).toBeNull();
  });
});

describe("mergeLines", () => {
  it("une tramos que comparten extremo, aunque vengan invertidos", () => {
    const merged = mergeLines([
      [[0, 0], [10, 0]],
      [[20, 0], [10, 0]],
    ]);
    expect(merged).toEqual([[[0, 0], [10, 0], [20, 0]]]);
  });
});

describe("overlaps", () => {
  it("reconoce tramos de la misma calle", () => {
    expect(overlaps([[-89.557, LAT], [-89.556, LAT]], calle47)).toBe(true);
    expect(overlaps(cruce(-89.554), calle47)).toBe(false);
  });
});
