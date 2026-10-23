"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, categoryConfig, type Category, type LatLng } from "@/lib/config";
import { agoLabel, daysBetween } from "@/lib/dates";
import { similarNearby } from "@/lib/duplicates";
import { pathLength, type Line } from "@/lib/geo";
import { compressPhoto } from "@/lib/photo";
import type { Report } from "@/lib/types";

export type StreetSelection = { name: string | null; lines: Line[]; manual: boolean };

type Props = {
  point: LatLng;
  category: Category;
  street: StreetSelection | null;
  photosEnabled: boolean;
  hidden: boolean;
  /** Reportes publicados, para avisar si ya hay uno igual muy cerca. */
  published: Report[];
  onDuplicate: (report: Report) => void;
  onChangeLocation: () => void;
  onCancel: () => void;
  onSubmitted: () => void;
};

export function ReportForm({
  point,
  category,
  street,
  photosEnabled,
  hidden,
  published,
  onDuplicate,
  onChangeLocation,
  onCancel,
  onSubmitted,
}: Props) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [similar, setSimilar] = useState<{ report: Report; meters: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const cat = CATEGORIES[category];
  const isStreet = categoryConfig(category).isStreet ?? false;

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isStreet && !street) return setError("Marca la calle en el mapa");

    const [lat, lng] = point;
    const match = similarNearby({ category, lat, lng, path: isStreet && street ? street.lines : null }, published)[0];
    if (match) setSimilar(match);
    else void send();
  }

  async function send() {
    setSimilar(null);
    if (!formRef.current) return;
    const fields = new FormData(formRef.current);
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
      if (typeof value === "string" && value.trim()) body.set(key, value);
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
    <form
      ref={formRef}
      className={`sheet sheet--form${hidden ? " sheet--hidden" : ""}`}
      onSubmit={handleSubmit} aria-label="Detalles del reporte">
      <div className="sheet__body">
        <p className="step">
          <span className="step__badge" style={{ "--chip-color": cat.color } as React.CSSProperties}>
            {cat.icon} {cat.label}
          </span>
          <button type="button" className="link-button" onClick={onChangeLocation}>
            {isStreet ? "Cambiar calle" : "Cambiar ubicación"}
          </button>
        </p>

        {isStreet && street && (
          <p className="hint hint--left">
            <strong>{street.manual ? "Calle trazada a mano" : (street.name ?? "Calle seleccionada")}</strong> · ≈{" "}
            {Math.round(pathLength(street.lines))} m marcados
          </p>
        )}

        {photosEnabled &&
          (preview ? (
            <div className="photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={preview} alt="Vista previa de la foto" />
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                }}
              >
                Quitar
              </button>
            </div>
          ) : (
            <label className="photo-input">
              <input type="file" accept="image/*" onChange={handlePhoto} disabled={processing} />
              <span aria-hidden>📷</span>
              {processing ? "Procesando foto…" : "Agregar foto (opcional)"}
            </label>
          ))}

        <label className="field">
          <span>
            Calle o referencia <span className="optional">(opcional)</span>
          </span>
          <input
            name="reference"
            maxLength={150}
            enterKeyHint="done"
            placeholder="Ej. Calle 47 x 4-B, frente a la tienda"
          />
        </label>

        <details className="more">
          <summary>Agregar descripción o tu nombre</summary>
          <label className="field">
            <span>
              Descripción <span className="optional">(opcional)</span>
            </span>
            <textarea name="description" maxLength={500} rows={3} placeholder="Ej. Bache grande, ocupa medio carril" />
          </label>

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
        </details>

        {/* Campo trampa para bots: oculto para personas. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="honeypot" aria-hidden />
      </div>

      <div className="sheet__footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="sheet__actions">
          <button type="button" className="btn btn--ghost btn--big" onClick={onCancel} disabled={sending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary btn--big" disabled={sending || processing}>
            {sending ? "Enviando…" : "Enviar reporte"}
          </button>
        </div>
        <p className="hint">
          Se publicará cuando lo apruebe el administrador.{" "}
          {anonymous ? "Es anónimo." : "Tu nombre se mostrará en el reporte."}
        </p>
      </div>

      {similar && (
        <SimilarDialog
          match={similar}
          onSame={() => {
            setSimilar(null);
            onDuplicate(similar.report);
          }}
          onDifferent={() => void send()}
          onClose={() => setSimilar(null)}
        />
      )}
    </form>
  );
}

type SimilarProps = {
  match: { report: Report; meters: number };
  onSame: () => void;
  onDifferent: () => void;
  onClose: () => void;
};

/** Pregunta si el problema ya está reportado antes de enviar uno repetido. */
function SimilarDialog({ match: { report, meters }, onSame, onDifferent, onClose }: SimilarProps) {
  const cat = CATEGORIES[report.category];
  const supportable = Boolean(categoryConfig(report.category).supportLabel);
  // Fuera del formulario: la hoja inferior crea su propio contexto de apilamiento.
  return createPortal(
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="similar-title"
        aria-describedby="similar-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__icon dialog__icon--warn" aria-hidden>
          {cat.icon}
        </div>
        <h2 id="similar-title">¿Ya está reportado?</h2>
        <p id="similar-desc">
          Hay un reporte de <strong>{cat.label.toLowerCase()}</strong> a {meters <= 5 ? "unos pasos" : `${meters} m`} de
          aquí. Revisa si es el mismo problema.
        </p>
        <div className="similar">
          {report.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de Vercel Blob
            <img src={report.photoUrl} alt="" />
          )}
          <div>
            <strong>{report.reference ?? cat.label}</strong>
            {report.description && <span>{report.description}</span>}
            <span>
              Reportado {agoLabel(daysBetween(report.createdAt))}
              {supportable && report.supportCount > 0 && ` · ${report.supportCount} apoyos`}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn--primary" onClick={onSame} autoFocus>
          {supportable ? "Sí, es el mismo: apoyarlo" : "Sí, es el mismo"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDifferent}>
          No, es otro: enviar mi reporte
        </button>
      </div>
    </div>,
    document.body,
  );
}
