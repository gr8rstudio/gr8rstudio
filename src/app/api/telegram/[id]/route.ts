import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { AgentBusyError, runTurnToText } from "@/lib/runtime/turn";
import { sendTelegramText, tg } from "@/lib/telegram";
import { open } from "@/lib/vault";

export const maxDuration = 800;

type Update = { message?: { text?: string; chat?: { id: number; type?: string } } };

function sameSecret(a: string | null, b: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, id));
  if (!agent?.telegramToken || !sameSecret(req.headers.get("x-telegram-bot-api-secret-token"), agent.telegramSecret)) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await req.json().catch(() => ({}))) as Update;
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  if (!text || chatId === undefined) return new Response("ok");

  const token = open(agent.telegramToken, env.appSecret);
  const chat = String(chatId);

  // Private bots: only the paired chat may talk to the agent.
  if (agent.telegramChatId !== chat) {
    const code = text.match(/^\/(?:start|pair)\s+(\d{6})$/)?.[1];
    if (code && agent.telegramPairCode && code === agent.telegramPairCode && !agent.telegramChatId) {
      await db.update(schema.agents).set({ telegramChatId: chat, telegramPairCode: null }).where(eq(schema.agents.id, id));
      after(() => sendTelegramText(token, chat, `Paired ✅ I'm ${agent.name}. Talk to me any time.`));
    } else {
      after(() => sendTelegramText(token, chat, "This is a private agent. Send /pair <code> from the Gr8r app to connect."));
    }
    return new Response("ok");
  }

  after(async () => {
    const typing = setInterval(() => tg(token, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {}), 4500);
    try {
      await tg(token, "sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
      const { text: reply, error } = await runTurnToText({ agent, text, channel: "telegram" });
      await sendTelegramText(token, chat, error ? `${reply ? reply + "\n\n" : ""}⚠️ ${error}` : reply);
    } catch (e) {
      const msg = e instanceof AgentBusyError ? e.message : `⚠️ ${(e as Error).message}`;
      await sendTelegramText(token, chat, msg).catch(() => {});
    } finally {
      clearInterval(typing);
    }
  });
  return new Response("ok");
}
