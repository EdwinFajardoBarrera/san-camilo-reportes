"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressPhoto } from "@/lib/photo";

/**
 * Foto de evidencia del equipo en la tarjeta del panel: subirla, cambiarla o
 * quitarla. Se comprime en el teléfono antes de enviarla (igual que las fotos
 * de los reportes), así pesa poco y casi no gasta almacenamiento.
 */
export function EvidencePhoto({
  reportId,
  url,
  uploadedBy,
  enabled,
}: {
  reportId: string;
  url: string | null;
  uploadedBy?: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(init: RequestInit, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/evidence`, init);
      if (!res.ok) {
        const message = (await res.json().catch(() => null))?.error;
        throw new Error(message ?? `No se pudo guardar (error ${res.status}). Intenta de nuevo.`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let blob: Blob;
    try {
      setBusy("Preparando foto…");
      blob = await compressPhoto(file);
    } catch {
      setBusy(null);
      return setError("No se pudo leer la foto. Prueba con otra.");
    }
    const body = new FormData();
    body.set("photo", blob, "evidencia.jpg");
    await request({ method: "POST", body }, "Subiendo…");
  }

  if (!url && !enabled) return null;

  return (
    <div className="evidence">
      {url && (
        <>
          <p className="evidence__title">
            📷 Evidencia del equipo{uploadedBy && <span className="optional"> · subió {uploadedBy}</span>}
          </p>
          <a href={url} target="_blank" rel="noreferrer" className="report__photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- fotos ya comprimidas, servidas desde Blob */}
            <img src={url} alt="Foto de evidencia" loading="lazy" />
          </a>
        </>
      )}
      {enabled && (
        <div className="evidence__actions">
          <label className={`btn btn--ghost btn--small${busy ? " is-disabled" : ""}`}>
            <input type="file" accept="image/*" onChange={handleFile} disabled={Boolean(busy)} hidden />
            {busy ?? (url ? "Cambiar evidencia" : "📷 Subir foto de evidencia")}
          </label>
          {url && !busy && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                if (window.confirm("¿Quitar la foto de evidencia?")) void request({ method: "DELETE" }, "Quitando…");
              }}
            >
              Quitar
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
