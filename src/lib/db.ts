import "server-only";
import postgres from "postgres";

declare global {
  // Reutiliza la conexión entre recargas en desarrollo.
  var __sql: postgres.Sql | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  return postgres(url, {
    // En serverless conviene pocas conexiones; el pooler de Neon hace el resto.
    max: 3,
    idle_timeout: 20,
    // Los poolers en modo transacción no soportan sentencias preparadas.
    prepare: false,
  });
}

export const sql = globalThis.__sql ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
