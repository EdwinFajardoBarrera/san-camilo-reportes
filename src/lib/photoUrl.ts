const PRIVATE_HOST = ".private.blob.vercel-storage.com";

/** La URL es de una foto en un almacén privado de Vercel Blob. */
export function isPrivateBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(PRIVATE_HOST) && u.pathname.startsWith("/reportes/");
  } catch {
    return false;
  }
}

/** Dirección para mostrar una foto: las privadas pasan por /api/fotos. */
export function photoSrc(url: string | null): string | null {
  if (!url || !isPrivateBlobUrl(url)) return url;
  return `/api/fotos?u=${encodeURIComponent(url)}`;
}
