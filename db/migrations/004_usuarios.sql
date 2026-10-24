-- Cuentas del panel: un administrador y los colaboradores que él da de alta.
CREATE TABLE IF NOT EXISTS users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username             text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  -- Hash scrypt con sal propia (ver src/lib/password.ts). Nunca la contraseña.
  password_hash        text NOT NULL,
  role                 text NOT NULL CHECK (role IN ('admin', 'colaborador')),
  active               boolean NOT NULL DEFAULT true,
  -- La contraseña la puso el administrador: se cambia al entrar.
  must_change_password boolean NOT NULL DEFAULT false,
  -- Al subirlo se invalidan todas las sesiones abiertas de la cuenta.
  session_version      integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_login_at        timestamptz
);

-- Solo puede existir un administrador: la base de datos rechaza un segundo.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin ON users (role) WHERE role = 'admin';

-- Intentos fallidos también por cuenta, para frenar ataques desde muchas IPs.
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS username text;
CREATE INDEX IF NOT EXISTS login_attempts_username_created_idx ON login_attempts (username, created_at);

-- Quién hizo el último cambio de estado de cada reporte.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by text;
