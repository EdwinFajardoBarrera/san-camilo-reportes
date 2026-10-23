import { describe, expect, it } from "vitest";
import { groupNearby, nearbyPublished } from "./duplicates";
import type { Report } from "./types";

const make = (id: string, lat: number, lng: number, extra: Partial<Report> = {}): Report => ({
  id,
  category: "bache",
  status: "pendiente",
  description: null,
  reference: null,
  lat,
  lng,
  createdAt: "2026-10-23T12:00:00Z",
  resolvedAt: null,
  path: null,
  photoUrl: null,
  reporterName: null,
  supportCount: 0,
  ...extra,
});

describe("groupNearby", () => {
  it("junta reportes de la misma categoría a menos de 40 m, en cadena", () => {
    const a = make("a", 20.97, -89.555);
    const b = make("b", 20.97025, -89.555); // ~28 m de a
    const c = make("c", 20.9705, -89.555); // ~28 m de b, ~56 m de a
    const far = make("far", 20.972, -89.555);
    expect(groupNearby([a, b, c, far]).map((g) => g.map((r) => r.id))).toEqual([["a", "b", "c"], ["far"]]);
  });

  it("no junta categorías distintas", () => {
    const a = make("a", 20.97, -89.555);
    const b = make("b", 20.97001, -89.555, { category: "alumbrado" });
    expect(groupNearby([a, b])).toHaveLength(2);
  });

  it("compara calles por su trazo", () => {
    const street = make("s", 20.97, -89.556, {
      category: "sin_pavimentar",
      path: [[[-89.556, 20.97], [-89.552, 20.97]]],
    });
    const nearEnd = make("n", 20.9703, -89.5525, { category: "sin_pavimentar" }); // ~33 m del trazo
    expect(groupNearby([street, nearEnd])).toHaveLength(1);
  });
});

describe("nearbyPublished", () => {
  it("lista los publicados cercanos, del más cercano al más lejano", () => {
    const fresh = make("new", 20.97, -89.555);
    const p1 = make("p1", 20.9703, -89.555, { status: "aprobado" });
    const p2 = make("p2", 20.9701, -89.555, { status: "aprobado" });
    const p3 = make("p3", 20.98, -89.555, { status: "aprobado" });
    expect(nearbyPublished(fresh, [p1, p2, p3]).map((m) => m.report.id)).toEqual(["p2", "p1"]);
  });
});
