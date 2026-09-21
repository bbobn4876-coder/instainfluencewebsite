import { Pool } from "pg";

/**
 * Storage runs on Postgres when DATABASE_URL is set, and on files under .data
 * otherwise. Serverless hosts (Netlify, Vercel) have no writable disk, so a
 * database is required there; a plain server can keep using files.
 */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let pool: Pool | undefined;
let ready: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Managed providers (Neon, Supabase, Railway) all terminate TLS for us.
      ssl: process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: false },
      max: Number(process.env.DATABASE_POOL ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/** Creates the tables on first use; safe to run on every cold start. */
async function migrate(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id          text PRIMARY KEY,
      email       text UNIQUE NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      salt        text NOT NULL,
      hash        text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data    jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id    text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config     jsonb,
      started_at timestamptz,
      day        text,
      used       integer NOT NULL DEFAULT 0,
      totals     jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS config jsonb;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS totals jsonb NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS app_meta (
      key   text PRIMARY KEY,
      value text NOT NULL
    );
  `);
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  if (!ready) ready = migrate();
  await ready;
  const result = await getPool().query(text, values);
  return result.rows as T[];
}
