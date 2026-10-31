import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put, type PutBlobResult } from "@vercel/blob";

// Fotos en Vercel Blob (gratis en el plan Hobby). En desarrollo, sin token,
// se puede usar STORAGE_DRIVER=local para guardarlas en public/uploads.
const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const localConfigured = () => !blobConfigured() && process.env.STORAGE_DRIVER === "local" && process.env.NODE_ENV !== "production";
const LOCAL_DIR = path.join(process.cwd(), "public", "uploads");

export function photosEnabled(): boolean {
  return blobConfigured() || localConfigured();
}

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

/** Tipo real del archivo según sus primeros bytes (no confiamos en la extensión). */
export function detectImageType(bytes: Uint8Array): { type: string; ext: string } | null {
  return SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

// Vercel Blob puede crearse como almacén público o privado, y uno privado
// rechaza las subidas públicas. Se prueba primero público y, si falla, privado;
// se recuerda lo que funcionó. Las fotos privadas se sirven con /api/fotos.
let blobAccess: "public" | "private" | null = null;

async function putBlob(name: string, bytes: Uint8Array, contentType: string): Promise<PutBlobResult> {
  const upload = (access: "public" | "private") =>
    put(name, Buffer.from(bytes), { access, contentType, cacheControlMaxAge: 60 * 60 * 24 * 365 });
  if (blobAccess) return upload(blobAccess);
  try {
    const blob = await upload("public");
    blobAccess = "public";
    return blob;
  } catch (publicError) {
    try {
      const blob = await upload("private");
      blobAccess = "private";
      return blob;
    } catch {
      throw publicError;
    }
  }
}

export async function savePhoto(bytes: Uint8Array, kind: { type: string; ext: string }): Promise<string> {
  const name = `reportes/${randomUUID()}.${kind.ext}`;
  if (blobConfigured()) return (await putBlob(name, bytes, kind.type)).url;
  if (localConfigured()) {
    const file = path.join(LOCAL_DIR, path.basename(name));
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(file, bytes);
    return `/uploads/${path.basename(name)}`;
  }
  throw new Error("Las fotos no están configuradas");
}

export async function deletePhoto(url: string | null): Promise<void> {
  if (!url) return;
  try {
    if (url.startsWith("/uploads/")) await unlink(path.join(LOCAL_DIR, path.basename(url)));
    else if (blobConfigured()) await del(url);
  } catch (err) {
    // No bloquear la acción del admin si la foto ya no existe.
    console.error("No se pudo borrar la foto", url, err);
  }
}
