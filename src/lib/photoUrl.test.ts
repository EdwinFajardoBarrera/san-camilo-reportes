import { describe, expect, it } from "vitest";
import { isPrivateBlobUrl, photoSrc } from "./photoUrl";

describe("photoSrc", () => {
  it("deja igual las fotos públicas y locales", () => {
    expect(photoSrc("https://abc.public.blob.vercel-storage.com/reportes/x.jpg")).toBe(
      "https://abc.public.blob.vercel-storage.com/reportes/x.jpg",
    );
    expect(photoSrc("/uploads/x.jpg")).toBe("/uploads/x.jpg");
    expect(photoSrc(null)).toBeNull();
  });

  it("pasa las privadas por /api/fotos", () => {
    const url = "https://abc.private.blob.vercel-storage.com/reportes/x.jpg";
    expect(photoSrc(url)).toBe(`/api/fotos?u=${encodeURIComponent(url)}`);
  });

  it("solo acepta fotos de reportes en Vercel Blob", () => {
    expect(isPrivateBlobUrl("https://evil.com/reportes/x.jpg")).toBe(false);
    expect(isPrivateBlobUrl("https://abc.private.blob.vercel-storage.com/otra/x.jpg")).toBe(false);
    expect(isPrivateBlobUrl("http://abc.private.blob.vercel-storage.com/reportes/x.jpg")).toBe(false);
  });
});
