import { PHOTO } from "./config";

/**
 * Reduce la foto en el navegador antes de subirla: máximo 1280 px por lado y
 * JPEG de calidad media (~150-250 KB). Así casi no se usa almacenamiento ni datos.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PHOTO.maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = PHOTO.quality;
  for (;;) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("No se pudo procesar la foto");
    if (blob.size <= PHOTO.maxBytes / 3 || quality <= 0.4) return blob;
    quality -= 0.1;
  }
}
