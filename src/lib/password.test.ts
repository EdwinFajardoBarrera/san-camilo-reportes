import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("contraseñas", () => {
  it("verifica la correcta y rechaza otras", async () => {
    const hash = await hashPassword("una contraseña larga");
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(hash).not.toContain("una contraseña larga");
    expect(await verifyPassword("una contraseña larga", hash)).toBe(true);
    expect(await verifyPassword("una contraseña larg", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("usa una sal distinta cada vez", async () => {
    expect(await hashPassword("misma-clave-123")).not.toBe(await hashPassword("misma-clave-123"));
  });

  it("no acepta hashes mal formados", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
    expect(needsRehash("basura")).toBe(true);
  });
});
