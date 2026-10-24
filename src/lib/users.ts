import "server-only";
import { query } from "./db";
import { hashPassword } from "./password";

export type Role = "admin" | "colaborador";

export type User = {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  createdAt: string;
  lastLoginAt: string | null;
};

type Row = {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  session_version: number;
  created_at: Date;
  last_login_at: Date | null;
};

const COLUMNS = "id, username, role, active, must_change_password, session_version, created_at, last_login_at";

const toUser = (r: Row): User => ({
  id: r.id,
  username: r.username,
  role: r.role,
  active: r.active,
  mustChangePassword: r.must_change_password,
  sessionVersion: r.session_version,
  createdAt: r.created_at.toISOString(),
  lastLoginAt: r.last_login_at?.toISOString() ?? null,
});

export async function findUserById(id: string): Promise<User | null> {
  const [row] = await query<Row>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return row ? toUser(row) : null;
}

/** Usuario y su hash, solo para iniciar sesión o cambiar la contraseña. */
export async function findCredentials(
  where: { username: string } | { id: string },
): Promise<(User & { passwordHash: string }) | null> {
  const [column, value] = "id" in where ? ["id", where.id] : ["username", where.username];
  const [row] = await query<Row & { password_hash: string }>(
    `SELECT ${COLUMNS}, password_hash FROM users WHERE ${column} = $1`,
    [value],
  );
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export async function adminExists(): Promise<boolean> {
  const [{ exists }] = await query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin')");
  return exists;
}

export async function listUsers(): Promise<User[]> {
  const rows = await query<Row>(`SELECT ${COLUMNS} FROM users ORDER BY role, username`);
  return rows.map(toUser);
}

/**
 * Crea la cuenta del administrador, solo si todavía no hay uno. El índice único
 * `users_single_admin` lo garantiza aunque dos personas lo intenten a la vez.
 */
export async function createAdmin(username: string, password: string): Promise<User | null> {
  const hash = await hashPassword(password);
  const rows = await query<Row>(
    `INSERT INTO users (username, password_hash, role)
     SELECT $1, $2, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
     ON CONFLICT DO NOTHING
     RETURNING ${COLUMNS}`,
    [username, hash],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/** Da de alta un colaborador con una contraseña temporal. null si el usuario ya existe. */
export async function createCollaborator(username: string, password: string): Promise<User | null> {
  const hash = await hashPassword(password);
  const rows = await query<Row>(
    `INSERT INTO users (username, password_hash, role, must_change_password)
     VALUES ($1, $2, 'colaborador', true)
     ON CONFLICT (username) DO NOTHING
     RETURNING ${COLUMNS}`,
    [username, hash],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Guarda una contraseña nueva y cierra las demás sesiones de la cuenta.
 * `temporary` = la puso el administrador y hay que cambiarla al entrar.
 * Devuelve la nueva versión de sesión.
 */
export async function setPassword(id: string, password: string, temporary: boolean): Promise<number | null> {
  const hash = await hashPassword(password);
  const rows = await query<{ session_version: number }>(
    `UPDATE users SET password_hash = $2, must_change_password = $3, session_version = session_version + 1
     WHERE id = $1 RETURNING session_version`,
    [id, hash, temporary],
  );
  return rows[0]?.session_version ?? null;
}

/** Rehace el hash con los parámetros actuales sin cerrar sesiones. */
export async function upgradeHash(id: string, password: string): Promise<void> {
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, await hashPassword(password)]);
}

export async function recordLogin(id: string): Promise<void> {
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [id]);
}

/** Activa o desactiva un colaborador. Al desactivarlo se cierran sus sesiones. */
export async function setCollaboratorActive(id: string, active: boolean): Promise<void> {
  await query(
    `UPDATE users SET active = $2, session_version = session_version + CASE WHEN $2 THEN 0 ELSE 1 END
     WHERE id = $1 AND role = 'colaborador'`,
    [id, active],
  );
}

export async function deleteCollaborator(id: string): Promise<void> {
  await query("DELETE FROM users WHERE id = $1 AND role = 'colaborador'", [id]);
}
