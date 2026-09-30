import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { ConnectionKind, Provider } from "../db/schema";
import { env } from "../env";
import { newId } from "../ids";
import { open, seal } from "../vault";

export async function getCredential(userId: string, provider: Provider) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, provider)));
  if (!row) return null;
  return { id: row.id, kind: row.kind, secret: open(row.secret, env.appSecret), label: row.label };
}

export async function saveCredential(
  userId: string,
  provider: Provider,
  kind: ConnectionKind,
  secret: string,
  label?: string,
) {
  const db = await getDb();
  const now = new Date();
  await db
    .delete(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, provider)));
  await db.insert(schema.connections).values({
    id: newId(),
    userId,
    provider,
    kind,
    secret: seal(secret, env.appSecret),
    label: label ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Codex rotates refresh tokens; persist the VM's refreshed auth.json back into the vault. */
export async function updateCredentialSecret(id: string, secret: string) {
  const db = await getDb();
  await db
    .update(schema.connections)
    .set({ secret: seal(secret, env.appSecret), updatedAt: new Date() })
    .where(eq(schema.connections.id, id));
}

export async function deleteCredential(userId: string, provider: Provider) {
  const db = await getDb();
  await db
    .delete(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, provider)));
}

export async function listConnections(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      provider: schema.connections.provider,
      kind: schema.connections.kind,
      label: schema.connections.label,
      updatedAt: schema.connections.updatedAt,
    })
    .from(schema.connections)
    .where(eq(schema.connections.userId, userId));
  return rows;
}
