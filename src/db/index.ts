import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database is optional.
 *
 * Arena entry points (MCP server, CLI, SharedNet agent) must run with no
 * Postgres at all — a missing DATABASE_URL degrades audit persistence and
 * thesis history, never the paid services themselves.
 */

const globalForDb = globalThis as typeof globalThis & {
  __thesisbreakerPool?: Pool;
  __thesisbreakerDb?: NodePgDatabase;
};

function connectionString(): string | null {
  const url = (process.env.DATABASE_URL ?? "").trim();
  return url.length > 0 ? url : null;
}

export function isDatabaseConfigured(): boolean {
  return connectionString() !== null;
}

/** Returns the database handle, or null when none is configured. */
export function getDb(): NodePgDatabase | null {
  const url = connectionString();
  if (!url) return null;

  if (!globalForDb.__thesisbreakerPool) {
    globalForDb.__thesisbreakerPool = new Pool({ connectionString: url });
  }
  if (!globalForDb.__thesisbreakerDb) {
    globalForDb.__thesisbreakerDb = drizzle(globalForDb.__thesisbreakerPool);
  }
  return globalForDb.__thesisbreakerDb;
}

/** Throws when no database is configured. For routes that genuinely require one. */
export function requireDb(): NodePgDatabase {
  const database = getDb();
  if (!database) {
    throw new Error("DATABASE_URL is required for this operation");
  }
  return database;
}

export function getPool(): Pool | null {
  if (!connectionString()) return null;
  getDb();
  return globalForDb.__thesisbreakerPool ?? null;
}

/**
 * Back-compat handle for existing application routes, which were written
 * against a always-present `db`. Property access throws the same clear error
 * `requireDb()` does when no database is configured.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    const real = requireDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
