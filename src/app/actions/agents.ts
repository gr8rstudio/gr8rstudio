"use server";

import { eq } from "drizzle-orm";
import { randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "./auth";
import { getAgent } from "@/lib/agents";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { bootstrapVm, writePersona } from "@/lib/runtime/bootstrap";
import { requireUser } from "@/lib/session";
import { tg } from "@/lib/telegram";
import { seal, open } from "@/lib/vault";
import { defaultVmProviderId, getVmProvider } from "@/lib/vm";

const AgentInput = z.object({
  name: z.string().trim().min(1, "Give your agent a name").max(40),
  emoji: z.string().trim().max(8).optional(),
  persona: z.string().max(8000).optional(),
  engine: z.enum(["claude", "codex"]),
  model: z.string().trim().max(80).optional(),
});

export async function createAgent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = AgentInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const id = newId();
  await db.insert(schema.agents).values({
    id,
    userId: user.id,
    name: parsed.data.name,
    emoji: parsed.data.emoji || "🤖",
    persona: parsed.data.persona ?? "",
    engine: parsed.data.engine,
    model: parsed.data.model || null,
    vmProvider: defaultVmProviderId(),
    vmName: `gr8r-agent-${id}`,
    createdAt: new Date(),
  });
  redirect(`/app/agents/${id}`);
}

export async function updateAgent(agentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent) return { error: "Agent not found" };
  const parsed = AgentInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const engineChanged = parsed.data.engine !== agent.engine;
  await db
    .update(schema.agents)
    .set({
      name: parsed.data.name,
      emoji: parsed.data.emoji || agent.emoji,
      persona: parsed.data.persona ?? "",
      engine: parsed.data.engine,
      model: parsed.data.model || null,
      personaDirty: true,
      ...(engineChanged ? { engineSessionId: null } : {}),
    })
    .where(eq(schema.agents.id, agentId));
  revalidatePath(`/app/agents/${agentId}`);
  return {};
}

export async function deleteAgent(agentId: string) {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent) return;
  const db = await getDb();
  if (agent.telegramToken) {
    await tg(open(agent.telegramToken, env.appSecret), "deleteWebhook").catch(() => {});
  }
  await getVmProvider(agent.vmProvider).destroy(agent.vmName).catch(() => {});
  await db.delete(schema.messages).where(eq(schema.messages.agentId, agentId));
  await db.delete(schema.agents).where(eq(schema.agents.id, agentId));
  redirect("/app");
}

export async function newConversation(agentId: string) {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent) return;
  const db = await getDb();
  await db.update(schema.agents).set({ engineSessionId: null }).where(eq(schema.agents.id, agentId));
  await db.insert(schema.messages).values({
    id: newId(),
    agentId,
    role: "system",
    content: "New conversation",
    createdAt: new Date(),
  });
  revalidatePath(`/app/agents/${agentId}`);
}

export type VmAction = "boot" | "sleep" | "reset";

export async function vmAction(agentId: string, action: VmAction): Promise<{ error?: string }> {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent) return { error: "Agent not found" };
  if (agent.busyUntil && agent.busyUntil > new Date()) return { error: "Agent is busy" };
  const db = await getDb();
  const provider = getVmProvider(agent.vmProvider);
  const set = (patch: Partial<typeof schema.agents.$inferInsert>) =>
    db.update(schema.agents).set(patch).where(eq(schema.agents.id, agentId));
  try {
    if (action === "boot") {
      await set({ vmStatus: "booting", vmError: null });
      const vm = await provider.open(agent.vmName);
      await bootstrapVm(vm);
      await writePersona(vm, agent);
      await set({ vmStatus: "ready", personaDirty: false });
    } else if (action === "sleep") {
      await provider.stop(agent.vmName);
      if (agent.vmStatus === "ready") await set({ vmStatus: "sleeping" });
    } else if (action === "reset") {
      await provider.destroy(agent.vmName);
      await set({ vmStatus: "none", vmError: null, engineSessionId: null, personaDirty: true });
      await db.insert(schema.messages).values({
        id: newId(),
        agentId,
        role: "system",
        content: "VM reset: fresh disk, new conversation",
        createdAt: new Date(),
      });
    }
  } catch (e) {
    await set({ vmStatus: "error", vmError: (e as Error).message.slice(0, 1000) });
    return { error: (e as Error).message };
  } finally {
    revalidatePath(`/app/agents/${agentId}`);
  }
  return {};
}

export async function connectTelegram(agentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent) return { error: "Agent not found" };
  const token = String(form.get("token") ?? "").trim();
  if (!/^\d+:[\w-]{30,}$/.test(token)) return { error: "That doesn't look like a BotFather token." };
  if (!env.appUrl.startsWith("https://")) {
    return { error: `Telegram needs a public https APP_URL for webhooks (current: ${env.appUrl}).` };
  }
  try {
    const me = await tg<{ username: string }>(token, "getMe");
    const secret = randomBytes(24).toString("hex");
    await tg(token, "setWebhook", {
      url: `${env.appUrl}/api/telegram/${agentId}`,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    const db = await getDb();
    await db
      .update(schema.agents)
      .set({
        telegramToken: seal(token, env.appSecret),
        telegramSecret: secret,
        telegramUsername: me.username,
        telegramPairCode: String(randomInt(100000, 999999)),
        telegramChatId: null,
      })
      .where(eq(schema.agents.id, agentId));
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/app/agents/${agentId}`);
  return {};
}

export async function disconnectTelegram(agentId: string) {
  const user = await requireUser();
  const agent = await getAgent(user.id, agentId);
  if (!agent?.telegramToken) return;
  await tg(open(agent.telegramToken, env.appSecret), "deleteWebhook").catch(() => {});
  const db = await getDb();
  await db
    .update(schema.agents)
    .set({ telegramToken: null, telegramSecret: null, telegramUsername: null, telegramPairCode: null, telegramChatId: null })
    .where(eq(schema.agents.id, agentId));
  revalidatePath(`/app/agents/${agentId}`);
}
