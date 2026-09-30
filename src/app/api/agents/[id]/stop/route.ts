import { and, eq, gt } from "drizzle-orm";
import { getAgent } from "@/lib/agents";
import { getDb, schema } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const agent = await getAgent(user.id, id);
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  const db = await getDb();
  await db
    .update(schema.agents)
    .set({ cancelRequested: true })
    .where(and(eq(schema.agents.id, id), gt(schema.agents.busyUntil, new Date())));
  return Response.json({ ok: true });
}
