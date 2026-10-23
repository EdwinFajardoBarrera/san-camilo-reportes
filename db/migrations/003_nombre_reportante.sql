-- Nombre que el vecino decide mostrar en su reporte. NULL = anónimo.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_name text CHECK (char_length(reporter_name) <= 60);
