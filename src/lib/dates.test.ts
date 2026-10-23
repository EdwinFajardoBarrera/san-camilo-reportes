import { describe, expect, it } from "vitest";
import { agoLabel, daysBetween, daysLabel, localDay } from "./dates";

describe("daysBetween", () => {
  it("cuenta días calendario en la hora de Yucatán", () => {
    // 23:30 del 1 de oct en Yucatán (UTC-6) y 00:30 del 2 de oct: un día de diferencia.
    expect(daysBetween("2026-10-02T05:30:00Z", "2026-10-02T06:30:00Z")).toBe(1);
    expect(daysBetween("2026-10-01T15:00:00Z", "2026-10-01T23:00:00Z")).toBe(0);
    expect(daysBetween("2026-09-23T12:00:00Z", "2026-10-23T12:00:00Z")).toBe(30);
  });

  it("nunca devuelve negativos", () => {
    expect(daysBetween("2026-10-23T12:00:00Z", "2026-10-20T12:00:00Z")).toBe(0);
  });
});

describe("etiquetas", () => {
  it("usa singular y plural", () => {
    expect(daysLabel(0)).toBe("hoy");
    expect(daysLabel(1)).toBe("1 día");
    expect(daysLabel(12)).toBe("12 días");
    expect(agoLabel(0)).toBe("hoy");
    expect(agoLabel(3)).toBe("hace 3 días");
  });

  it("formatea el día local", () => {
    expect(localDay("2026-10-02T05:30:00Z")).toBe("2026-10-01");
  });
});
