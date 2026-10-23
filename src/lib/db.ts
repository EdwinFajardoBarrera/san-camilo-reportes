import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, types, type QueryResultRow } from "pg";

// count(*)::int y similares ya llegan como número; los float8 también.
types.setTypeParser(types.builtins.FLOAT8, Number);

declare global {
  // Reutiliza el pool entre invocaciones y recargas en desarrollo.
  var __pool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta la variable de entorno DATABASE_URL");
  // Conexión "pooled" de Neon: el pooler del lado de Neon multiplexa; aquí pocas conexiones.
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 5_000 });
  // En Vercel Fluid compute, cierra las conexiones ociosas antes de suspender la función.
  attachDatabasePool(pool);
  return pool;
}

/** Pool de Postgres, creado al primer uso (no durante el build). */
function pool(): Pool {
  if (!globalThis.__pool) globalThis.__pool = createPool();
  return globalThis.__pool;
}

/** Ejecuta una consulta parametrizada ($1, $2, …) y devuelve las filas. */
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}
