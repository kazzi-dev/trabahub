import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

// Both drivers expose the same query builder; we type against the node-postgres flavour.
export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  db: Db;
  /** Runs a multi-statement SQL string (used by the migration runner). */
  exec(sql: string): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * postgres://... → node-postgres pool (Neon in production).
 * "" → in-memory PGlite (tests). "pglite:<dir>" → PGlite persisted to a folder (local dev).
 * PGlite is PostgreSQL compiled to WebAssembly, so local work needs no Docker or server.
 */
export async function createDatabase(url: string): Promise<Database> {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pool = new pg.Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    return {
      db: drizzlePg(pool, { schema }),
      exec: async (sql) => {
        await pool.query(sql);
      },
      query: async <T>(sql: string, params?: unknown[]) =>
        (await pool.query(sql, params)).rows as T[],
      close: () => pool.end(),
    };
  }

  const dataDir = url.startsWith("pglite:") ? url.slice("pglite:".length) : undefined;
  const client = new PGlite(dataDir);
  return {
    db: drizzlePglite(client, { schema }) as unknown as Db,
    exec: async (sql) => {
      await client.exec(sql);
    },
    query: async <T>(sql: string, params?: unknown[]) =>
      (await client.query<T>(sql, params)).rows,
    close: () => client.close(),
  };
}

/** Applies every migrations/*.sql file not yet recorded, in filename order. */
export async function migrate(
  database: Database,
  dir = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "migrations"),
): Promise<string[]> {
  await database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set(
    (await database.query<{ name: string }>("SELECT name FROM schema_migrations")).map(
      (r) => r.name,
    ),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await database.exec(`BEGIN;\n${sql}\nCOMMIT;`);
    await database.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    applied.push(file);
  }
  return applied;
}
