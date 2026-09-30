import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getVmProvider } from "@/lib/vm";

export const dynamic = "force-dynamic";

/** Deploy check: database reachable and which VM provider is active. */
export async function GET() {
  const provider = getVmProvider();
  try {
    const db = await getDb();
    await db.run(sql`select 1`);
    return Response.json({ ok: true, db: "ok", vmProvider: provider.id, isolated: provider.isolated });
  } catch (e) {
    return Response.json({ ok: false, db: (e as Error).message, vmProvider: provider.id }, { status: 503 });
  }
}
