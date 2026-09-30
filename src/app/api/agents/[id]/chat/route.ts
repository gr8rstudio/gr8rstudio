import { z } from "zod";
import { getAgent } from "@/lib/agents";
import { AgentBusyError, runTurn } from "@/lib/runtime/turn";
import { currentUser } from "@/lib/session";

export const maxDuration = 800;

const Body = z.object({ text: z.string().trim().min(1).max(20000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const agent = await getAgent(user.id, id);
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Message is empty" }, { status: 400 });

  const turn = runTurn({ agent, text: parsed.data.text, channel: "web" });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          open = false; // client went away; keep draining so the turn is saved
        }
      };
      try {
        for await (const ev of turn) send(ev);
      } catch (e) {
        const message = e instanceof AgentBusyError ? e.message : `Unexpected error: ${(e as Error).message}`;
        send({ type: "error", message });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
