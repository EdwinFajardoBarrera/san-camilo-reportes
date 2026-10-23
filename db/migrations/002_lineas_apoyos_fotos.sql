-- Trazo de la calle (MultiLineString en [lng, lat]) para reportes de calles sin pavimentar.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS path jsonb;
-- URL pública de la foto del reporte (opcional).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS photo_url text;

-- Vecinos que apoyan una iniciativa (p. ej. pavimentar una calle). Uno por persona.
CREATE TABLE IF NOT EXISTS supports (
  report_id      uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  supporter_hash text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, supporter_hash)
);
