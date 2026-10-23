"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, type Category, type LatLng } from "@/lib/config";

type Props = {
  point: LatLng;
  onCancel: () => void;
  onRepick: () => void;
  onSubmitted: () => void;
};

export function ReportForm({ point, onCancel, onRepick, onSubmitted }: Props) {
  const [category, setCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category) {
      setError("Elige qué tipo de problema es");
      return;
    }
    const form = new FormData(e.currentTarget);
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          lat: point[0],
          lng: point[1],
          reference: form.get("reference") || undefined,
          description: form.get("description") || undefined,
          website: form.get("website") || undefined,
        }),
      });
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
    <form className="sheet" onSubmit={handleSubmit} aria-labelledby="form-title">
      <div className="sheet__head">
        <h2 id="form-title">Nuevo reporte</h2>
        <button type="button" className="btn btn--ghost" onClick={onRepick}>
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
                onChange={() => setCategory(key)}
              />
              <span aria-hidden>{cat.icon}</span> {cat.label}
            </label>
          );
        })}
      </fieldset>

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
        <button type="submit" className="btn btn--primary" disabled={sending}>
          {sending ? "Enviando…" : "Enviar reporte"}
        </button>
      </div>
      <p className="hint">Tu reporte se publicará después de ser revisado. No guardamos tu nombre.</p>
    </form>
  );
}
