import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent } from "./db/schema";

export async function listAgents(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .orderBy(desc(schema.agents.createdAt));
}

export async function getAgent(userId: string, agentId: string): Promise<Agent | null> {
  const db = await getDb();
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));
  return agent ?? null;
}

export async function listMessages(agentId: string, limit = 200) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.agentId, agentId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

