import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { query } from "./db";
import { LOGIN_RATE_LIMIT } from "./config";
import { dummyHash, needsRehash, verifyPassword } from "./password";
import { anonymize, getSessionSecret } from "./secrets";
import { findCredentials, findUserById, recordLogin, upgradeHash, type User } from "./users";

const COOKIE = "sc_session";
const SESSION_DAYS = 7;

/**
 * Contraseña de ADMIN_PASSWORD. Solo sirve para crear la cuenta del administrador
 * la primera vez; en cuanto existe, la variable se ignora y se puede borrar.
 */
export function setupPasswordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Comparar hashes de igual longitud en tiempo constante.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const setupAvailable = () => Boolean(process.env.ADMIN_PASSWORD);

/** Bloqueado si hubo demasiados fallos desde esta IP o contra esta cuenta. */
export async function isLoginBlocked(ip: string, username?: string): Promise<boolean> {
  const [{ by_ip, by_user }] = await query<{ by_ip: number; by_user: number }>(
    `SELECT count(*) FILTER (WHERE ip_hash = $1)::int AS by_ip,
            count(*) FILTER (WHERE username = $3)::int AS by_user
     FROM login_attempts
     WHERE (ip_hash = $1 OR username = $3) AND created_at > now() - make_interval(mins => $2)`,
    [anonymize(ip), LOGIN_RATE_LIMIT.windowMinutes, username ?? null],
  );
  return by_ip >= LOGIN_RATE_LIMIT.max || by_user >= LOGIN_RATE_LIMIT.maxPerAccount;
}

export async function recordFailedLogin(ip: string, username?: string): Promise<void> {
  await query("INSERT INTO login_attempts (ip_hash, username) VALUES ($1, $2)", [anonymize(ip), username ?? null]);
  // Limpieza oportunista de registros viejos.
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
}

/**
 * Devuelve el usuario si la contraseña es correcta y la cuenta está activa.
 * Siempre calcula un hash, exista o no el usuario, para no revelar cuáles existen.
 */
export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = await findCredentials({ username });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !ok || !user.active) return null;
  if (needsRehash(user.passwordHash)) await upgradeHash(user.id, password);
  await recordLogin(user.id);
  return user;
}

/** Comprueba la contraseña actual de una cuenta (para cambiarla). */
export async function checkPassword(id: string, password: string): Promise<boolean> {
  const user = await findCredentials({ id });
  return Boolean(user && (await verifyPassword(password, user.passwordHash)));
}

export async function startSession(user: Pick<User, "id" | "sessionVersion">): Promise<void> {
  const token = await new SignJWT({ v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
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
  const jar = await cookies();
  jar.delete(COOKIE);
  // Cookie del sistema anterior (solo contraseña de ADMIN_PASSWORD).
  jar.delete("sc_admin");
}

/**
 * Usuario de la sesión actual, comprobado contra la base en cada petición: si la
 * cuenta se desactiva, se borra o cambia de contraseña, la sesión deja de valer.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await findUserById(payload.sub);
    return user && user.active && user.sessionVersion === payload.v ? user : null;
  } catch {
    return null;
  }
});

/** Hay alguien del equipo (admin o colaborador) con sesión lista para trabajar. */
export async function isStaff(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && !user.mustChangePassword);
}

/** Admin o colaborador: revisar reportes. */
export async function requireStaff(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) throw new Error("No autorizado");
  return user;
}

/** Solo el administrador: eliminar reportes y manejar cuentas. */
export async function requireAdmin(): Promise<User> {
  const user = await requireStaff();
  if (user.role !== "admin") throw new Error("No autorizado");
  return user;
}
