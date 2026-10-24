-- Vecinos que avisan que un reporte publicado ya se arregló. Uno por persona.
-- No cambia el estado: el equipo lo revisa y decide si lo marca como arreglado.
CREATE TABLE IF NOT EXISTS fixed_votes (
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  voter_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, voter_hash)
);
