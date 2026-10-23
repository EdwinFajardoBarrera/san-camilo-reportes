import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { LOGIN_RATE_LIMIT } from "./config";
import { anonymize, getSessionSecret } from "./secrets";

const COOKIE = "sc_admin";
const SESSION_DAYS = 7;

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Falta la variable de entorno ADMIN_PASSWORD");
  // Comparar hashes de igual longitud en tiempo constante.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function isLoginBlocked(ip: string): Promise<boolean> {
  const sql = db();
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM login_attempts
    WHERE ip_hash = ${anonymize(ip)}
      AND created_at > now() - make_interval(mins => ${LOGIN_RATE_LIMIT.windowMinutes})`;
  return n >= LOGIN_RATE_LIMIT.max;
}

export async function recordFailedLogin(ip: string): Promise<void> {
  const sql = db();
  await sql`INSERT INTO login_attempts (ip_hash) VALUES (${anonymize(ip)})`;
  // Limpieza oportunista de registros viejos.
  await sql`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`;
}

export async function startSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSessionSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("No autorizado");
}
