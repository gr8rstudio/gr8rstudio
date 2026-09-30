import "server-only";
import { mkdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "../env";
import * as schema from "./schema";

// Idempotent bootstrap so a fresh libSQL/Turso database works with zero setup.
const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, kind TEXT NOT NULL,
    secret TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS connections_user_idx ON connections(user_id)`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🤖',
    persona TEXT NOT NULL DEFAULT '', engine TEXT NOT NULL, model TEXT,
    vm_provider TEXT NOT NULL, vm_name TEXT NOT NULL, vm_status TEXT NOT NULL DEFAULT 'none', vm_error TEXT,
    persona_dirty INTEGER NOT NULL DEFAULT 1, engine_session_id TEXT, busy_until INTEGER,
    telegram_token TEXT, telegram_secret TEXT, telegram_username TEXT, telegram_pair_code TEXT,
    telegram_chat_id TEXT, created_at INTEGER NOT NULL, last_active_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS agents_user_idx ON agents(user_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
    parts TEXT, channel TEXT NOT NULL DEFAULT 'web', meta TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_agent_idx ON messages(agent_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS login_flows (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, vm_name TEXT NOT NULL,
    status TEXT NOT NULL, url TEXT, code TEXT, error TEXT, created_at INTEGER NOT NULL)`,
];

type Db = LibSQLDatabase<typeof schema>;

const g = globalThis as unknown as { __gr8rDb?: Promise<Db> };

async function init(): Promise<Db> {
  const url = env.databaseUrl;
  if (url.startsWith("file:")) {
    const dir = url.slice(5).split("/").slice(0, -1).join("/");
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const client: Client = createClient({ url, authToken: env.databaseAuthToken });
  await client.batch(DDL, "write");
  return drizzle(client, { schema });
}

export function getDb(): Promise<Db> {
  g.__gr8rDb ??= init().catch((e) => {
    g.__gr8rDb = undefined;
    throw e;
  });
  return g.__gr8rDb;
}

export { schema };
