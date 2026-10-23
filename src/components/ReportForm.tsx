"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, categoryConfig, type Category, type LatLng } from "@/lib/config";
import { pathLength, type Line } from "@/lib/geo";
import { compressPhoto } from "@/lib/photo";

export type StreetSelection = { name: string | null; lines: Line[]; manual: boolean };

type Props = {
  point: LatLng;
  category: Category | null;
  onCategoryChange: (category: Category) => void;
  street: StreetSelection | null;
  streetError: string | null;
  onDrawStreet: () => void;
  onRepick: () => void;
  photosEnabled: boolean;
  hidden: boolean;
  onCancel: () => void;
  onSubmitted: () => void;
};

export function ReportForm({
  point,
  category,
  onCategoryChange,
  street,
  streetError,
  onDrawStreet,
  onRepick,
  photosEnabled,
  hidden,
  onCancel,
  onSubmitted,
}: Props) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const isStreet = category ? (categoryConfig(category).isStreet ?? false) : false;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const blob = await compressPhoto(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError("No se pudo leer la foto. Prueba con otra.");
    } finally {
      setProcessing(false);
    }
  }

  function removePhoto() {
    setPhoto(null);
    setPreview(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) return setError("Elige qué tipo de problema es");
    if (isStreet && !street) return setError("Marca la calle en el mapa");

    const fields = new FormData(e.currentTarget);
    const body = new FormData();
    body.set("category", category);
    if (isStreet && street) body.set("path", JSON.stringify(street.lines));
    else {
      body.set("lat", String(point[0]));
      body.set("lng", String(point[1]));
    }
    const keys = ["reference", "description", "website", ...(anonymous ? [] : ["reporterName"])];
    for (const key of keys) {
      const value = fields.get(key);
      if (typeof value === "string" && value) body.set(key, value);
    }
    if (photo) body.set("photo", photo, "foto.jpg");

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo enviar el reporte. Intenta de nuevo.");
        return;
      }
      onSubmitted();
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={`sheet${hidden ? " sheet--hidden" : ""}`} onSubmit={handleSubmit} aria-labelledby="form-title">
      <div className="sheet__head">
        <h2 id="form-title">Nuevo reporte</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onRepick}>
          Mover punto
        </button>
      </div>

      <fieldset className="categories">
        <legend>¿Qué problema es?</legend>
        {CATEGORY_KEYS.map((key) => {
          const cat = CATEGORIES[key];
          return (
            <label key={key} className="category" style={{ "--chip-color": cat.color } as React.CSSProperties}>
              <input
                type="radio"
                name="category"
                value={key}
                checked={category === key}
                onChange={() => onCategoryChange(key)}
              />
              <span aria-hidden>{cat.icon}</span> {cat.label}
            </label>
          );
        })}
      </fieldset>

      {isStreet && (
        <div className="street-box">
          {street ? (
            <p>
              <strong>{street.manual ? "Calle trazada a mano" : (street.name ?? "Calle seleccionada")}</strong>
              <span className="optional"> · ≈ {Math.round(pathLength(street.lines))} m marcados en el mapa</span>
            </p>
          ) : (
            <p className="optional">{streetError ?? "Buscando la calle…"}</p>
          )}
          <div className="street-box__actions">
            <button type="button" className="btn btn--ghost btn--small" onClick={onRepick}>
              Elegir otra calle
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onDrawStreet}>
              ✏️ Trazar a mano
            </button>
          </div>
        </div>
      )}

      <label className="field">
        <span>
          Calle o referencia <span className="optional">(opcional)</span>
        </span>
        <input name="reference" maxLength={150} placeholder="Ej. Calle 47 x 4-B, frente a la tienda" />
      </label>

      <label className="field">
        <span>
          Descripción <span className="optional">(opcional)</span>
        </span>
        <textarea name="description" maxLength={500} rows={3} placeholder="Ej. Bache grande, ocupa medio carril" />
      </label>

      {photosEnabled && (
        <div className="field">
          <span>
            Foto <span className="optional">(opcional)</span>
          </span>
          {preview ? (
            <div className="photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={preview} alt="Vista previa de la foto" />
              <button type="button" className="btn btn--ghost btn--small" onClick={removePhoto}>
                Quitar foto
              </button>
            </div>
          ) : (
            <label className="photo-input">
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} disabled={processing} />
              {processing ? "Procesando foto…" : "📷 Tomar o elegir foto"}
            </label>
          )}
        </div>
      )}

      <fieldset className="identity">
        <legend>¿Quién reporta?</legend>
        <div className="identity__options">
          <label className="identity__option">
            <input type="radio" name="identity" checked={anonymous} onChange={() => setAnonymous(true)} />
            Anónimo
          </label>
          <label className="identity__option">
            <input type="radio" name="identity" checked={!anonymous} onChange={() => setAnonymous(false)} />
            Con mi nombre
          </label>
        </div>
        {!anonymous && (
          <input
            name="reporterName"
            className="identity__name"
            maxLength={60}
            required
            autoComplete="name"
            placeholder="Tu nombre como quieres que aparezca"
            aria-label="Tu nombre"
          />
        )}
      </fieldset>

      {/* Campo trampa para bots: oculto para personas. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="honeypot" aria-hidden />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="sheet__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={sending}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={sending || processing}>
          {sending ? "Enviando…" : "Enviar reporte"}
        </button>
      </div>
      <p className="hint">
        Tu reporte se publicará después de ser revisado.{" "}
        {anonymous ? "No guardamos ningún dato tuyo." : "Tu nombre se mostrará junto al reporte."}
      </p>
    </form>
  );
}
