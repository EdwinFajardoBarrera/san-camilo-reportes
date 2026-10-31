import { get } from "@vercel/blob";
import { isPrivateBlobUrl } from "@/lib/photoUrl";

/**
 * Sirve una foto guardada en un almacén privado de Vercel Blob. Los nombres son
 * aleatorios y nunca cambian, así que la CDN de Vercel la guarda un año.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("u");
  if (!url || !isPrivateBlobUrl(url)) return new Response("Foto no encontrada", { status: 404 });
  const result = await get(url, { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) return new Response("Foto no encontrada", { status: 404 });
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
