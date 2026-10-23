// Aplica en orden las migraciones de db/migrations que aún no se han ejecutado.
// Uso: DATABASE_URL=... npm run db:migrate   (agrega --seed para cargar db/seed.sql)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta la variable DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const dir = path.join(root, "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`Aplicada: ${file}`);
  }

  if (process.argv.includes("--seed")) {
    await sql.unsafe(await readFile(path.join(root, "db", "seed.sql"), "utf8"));
    console.log("Datos iniciales cargados.");
  }
  console.log("Base de datos al día.");
} finally {
  await sql.end();
}
