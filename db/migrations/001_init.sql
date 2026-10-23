-- Reportes ciudadanos de problemas en la vía pública.
CREATE TABLE IF NOT EXISTS reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL CHECK (category IN ('bache', 'alumbrado', 'inundacion', 'sin_pavimentar')),
  status       text NOT NULL DEFAULT 'pendiente'
               CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'resuelto')),
  description  text CHECK (char_length(description) <= 500),
  reference    text CHECK (char_length(reference) <= 150),
  lat          double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- Hash irreversible de la IP, solo para limitar envíos abusivos.
  reporter_hash text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  resolved_at  timestamptz
);

CREATE INDEX IF NOT EXISTS reports_status_created_idx ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_reporter_created_idx ON reports (reporter_hash, created_at);

-- Intentos fallidos de acceso al panel, para frenar ataques de fuerza bruta.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         bigserial PRIMARY KEY,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_ip_created_idx ON login_attempts (ip_hash, created_at);
