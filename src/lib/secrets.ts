import "server-only";
import { createHash } from "node:crypto";

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  }
  return new TextEncoder().encode(secret);
}

/** Hash con sal de un identificador (p. ej. IP) para no guardar datos personales. */
export function anonymize(value: string): string {
  return createHash("sha256").update(`${process.env.SESSION_SECRET}:${value}`).digest("hex");
}
