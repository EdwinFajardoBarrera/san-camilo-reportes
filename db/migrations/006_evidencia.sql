-- Foto de evidencia que sube el equipo (admin o colaborador) desde el panel,
-- por ejemplo para confirmar el problema o mostrar que ya se arregló.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_url text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_by text;
