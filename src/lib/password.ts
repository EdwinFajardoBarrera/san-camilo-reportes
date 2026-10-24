import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt viene con Node (sin dependencias nativas) y es una de las funciones que
// OWASP recomienda para guardar contraseñas. Parámetros de OWASP: N=2^17, r=8, p=1
// (unos 128 MiB y una fracción de segundo por intento, caro para un atacante).
const PARAMS = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, { N, r, p }: typeof PARAMS): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r + 1024 * 1024 };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Devuelve el hash en formato `scrypt$N$r$p$sal$hash` (base64), con sal aleatoria. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

function parse(stored: string) {
  const [alg, N, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return null;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every(Number.isSafeInteger)) return null;
  return { params, salt: Buffer.from(salt, "base64"), key: Buffer.from(key, "base64") };
}

/** Compara en tiempo constante. Un hash mal formado nunca coincide. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed.params);
  return candidate.length === parsed.key.length && timingSafeEqual(candidate, parsed.key);
}

/** Si el hash se hizo con parámetros más débiles que los actuales, conviene rehacerlo. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.params.N < PARAMS.N || parsed.params.r < PARAMS.r || parsed.params.p < PARAMS.p;
}

// Hash de una contraseña que nadie conoce: se verifica contra él cuando el usuario
// no existe, para que la respuesta tarde lo mismo y no revele qué usuarios hay.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));
