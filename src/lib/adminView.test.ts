import { describe, expect, it } from "vitest";
import { adminViewQuery, applyAdminView, parseAdminView } from "./adminView";
import type { Report } from "./types";

const r = (id: string, category: Report["category"]) => ({ id, category }) as Report;
const reports = [r("1", "inundacion"), r("2", "bache"), r("3", "sin_pavimentar"), r("4", "bache"), r("5", "alumbrado")];

describe("parseAdminView", () => {
  it("ignora valores desconocidos", () => {
    expect(parseAdminView({ tipo: "otro", orden: "x" })).toEqual({ category: null, sort: "fecha" });
    expect(parseAdminView({})).toEqual({ category: null, sort: "fecha" });
  });
  it("lee tipo y orden", () => {
    expect(parseAdminView({ tipo: "bache", orden: "tipo" })).toEqual({ category: "bache", sort: "tipo" });
  });
});

describe("applyAdminView", () => {
  it("sin filtro ni orden deja la lista igual", () => {
    expect(applyAdminView(reports, { category: null, sort: "fecha" })).toBe(reports);
  });
  it("filtra por tipo", () => {
    expect(applyAdminView(reports, { category: "bache", sort: "fecha" }).map((x) => x.id)).toEqual(["2", "4"]);
  });
  it("ordena por tipo conservando el orden dentro de cada uno", () => {
    expect(applyAdminView(reports, { category: null, sort: "tipo" }).map((x) => x.id)).toEqual(["2", "4", "5", "1", "3"]);
  });
});

describe("adminViewQuery", () => {
  it("omite los valores por omisión", () => {
    expect(adminViewQuery("pendiente", { category: null, sort: "fecha" })).toBe("estado=pendiente");
    expect(adminViewQuery("aprobado", { category: "bache", sort: "tipo" })).toBe("estado=aprobado&tipo=bache&orden=tipo");
  });
});
