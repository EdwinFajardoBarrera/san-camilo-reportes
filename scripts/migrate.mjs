// Aplica en orden las migraciones de db/migrations que aún no se han ejecutado.
// Uso: npm run db:migrate   (npm run db:seed además carga db/seed.sql)
// Neon recomienda migrar con la conexión directa (sin "-pooler"), por eso se
// prefiere DATABASE_URL_UNPOOLED cuando existe.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Falta la variable DATABASE_URL (o DATABASE_URL_UNPOOLED).");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const dir = path.join(root, "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(body);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log(`Aplicada: ${file}`);
  }

  if (process.argv.includes("--seed")) {
    await client.query(await readFile(path.join(root, "db", "seed.sql"), "utf8"));
    console.log("Datos iniciales cargados.");
  }
  console.log("Base de datos al día.");
} finally {
  await client.end();
}
