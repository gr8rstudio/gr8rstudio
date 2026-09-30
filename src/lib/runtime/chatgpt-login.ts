import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { vmPaths } from "../engines";
import { newId } from "../ids";
import { getVmProvider, shellQuote } from "../vm";
import { bootstrapVm } from "./bootstrap";
import { saveCredential } from "./connections";

/**
 * "Sign in with ChatGPT": run the official `codex login --device-auth` inside a throwaway VM,
 * surface the verification URL + one-time code to the user, and when they approve it on
 * openai.com, move the resulting auth.json into the encrypted vault. Then destroy the VM.
 */

const loginVmName = (userId: string) => `gr8r-login-${userId}`;
const FLOW_TTL_MS = 20 * 60 * 1000;

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

export function parseDeviceAuth(log: string): { url: string | null; code: string | null } {
  // Codex prints:
  //   1. Open this link in your browser and sign in to your account
  //      https://auth.openai.com/codex/device
  //   2. Enter this one-time code (expires in 15 minutes)
  //      ABCD-EFGH
  const lines = log.replace(ANSI, "").split("\n").map((l) => l.trim());
  const urls = lines.flatMap((l) => l.match(/https:\/\/[^\s"'<>]+/g) ?? []);
  const url = urls.find((u) => u.includes("/device")) ?? urls[0] ?? null;
  let code: string | null = null;
  const i = lines.findIndex((l) => /one-time code/i.test(l));
  if (i >= 0) code = lines.slice(i + 1).find((l) => /^[A-Z0-9][A-Z0-9-]{3,}$/i.test(l)) ?? null;
  code ??= lines.join(" ").match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,6}\b/)?.[0] ?? null;
  return { url, code };
}

export async function startChatGptLogin(userId: string) {
  const db = await getDb();
  const id = newId();
  await db.delete(schema.loginFlows).where(eq(schema.loginFlows.userId, userId));
  await db.insert(schema.loginFlows).values({
    id,
    userId,
    provider: "chatgpt",
    vmName: loginVmName(userId),
    status: "starting",
    createdAt: new Date(),
  });
  return id;
}

/** Slow part (VM boot + CLI install); run it in `after()`. */
export async function launchChatGptLogin(flowId: string) {
  const db = await getDb();
  const [flow] = await db.select().from(schema.loginFlows).where(eq(schema.loginFlows.id, flowId));
  if (!flow) return;
  try {
    const provider = getVmProvider();
    await provider.destroy(flow.vmName).catch(() => {});
    const vm = await provider.open(flow.vmName, { persistent: false, timeoutMs: FLOW_TTL_MS });
    const p = await bootstrapVm(vm, ["@openai/codex@latest"]);
    const log = `${p.root}/login.log`;
    const exit = `${p.root}/login.exit`;
    await vm.spawnBackground(
      `rm -f ${shellQuote(log)} ${shellQuote(exit)}; ` +
        `${shellQuote(p.bin("codex"))} login --device-auth > ${shellQuote(log)} 2>&1; ` +
        `echo $? > ${shellQuote(exit)}`,
      { CODEX_HOME: p.codexDir, NO_COLOR: "1" },
    );
    await db.update(schema.loginFlows).set({ status: "waiting" }).where(eq(schema.loginFlows.id, flowId));
  } catch (e) {
    await db
      .update(schema.loginFlows)
      .set({ status: "error", error: (e as Error).message.slice(0, 1000) })
      .where(eq(schema.loginFlows.id, flowId));
  }
}

export type LoginFlowView = {
  status: "starting" | "waiting" | "done" | "error";
  url: string | null;
  code: string | null;
  error: string | null;
};

export async function pollChatGptLogin(userId: string, flowId: string): Promise<LoginFlowView | null> {
  const db = await getDb();
  const [flow] = await db
    .select()
    .from(schema.loginFlows)
    .where(and(eq(schema.loginFlows.id, flowId), eq(schema.loginFlows.userId, userId)));
  if (!flow) return null;
  const view = (): LoginFlowView => ({
    status: flow.status,
    url: flow.url,
    code: flow.code,
    error: flow.error,
  });
  if (flow.status !== "waiting") return view();

  if (Date.now() - flow.createdAt.getTime() > FLOW_TTL_MS) {
    flow.status = "error";
    flow.error = "Login timed out. Start again.";
    await db.update(schema.loginFlows).set({ status: "error", error: flow.error }).where(eq(schema.loginFlows.id, flowId));
    await getVmProvider().destroy(flow.vmName).catch(() => {});
    return view();
  }

  const provider = getVmProvider();
  const vm = await provider.open(flow.vmName, { persistent: false, timeoutMs: FLOW_TTL_MS });
  const p = vmPaths(vm.root);
  const [log, exit] = await Promise.all([vm.readFile(`${p.root}/login.log`), vm.readFile(`${p.root}/login.exit`)]);
  const { url, code } = parseDeviceAuth(log ?? "");
  const patch: Partial<typeof flow> = {};
  if (url && url !== flow.url) patch.url = url;
  if (code && code !== flow.code) patch.code = code;

  if (exit !== null && exit.trim() !== "") {
    const auth = exit.trim() === "0" ? await vm.readFile(`${p.codexDir}/auth.json`) : null;
    if (auth) {
      let label = "ChatGPT account";
      try {
        const parsed = JSON.parse(auth);
        label = parsed?.tokens?.account_id ? `ChatGPT (${String(parsed.tokens.account_id).slice(0, 8)}…)` : label;
      } catch {
        /* keep default label */
      }
      await saveCredential(userId, "chatgpt", "auth_json", auth, label);
      patch.status = "done";
    } else {
      patch.status = "error";
      patch.error = (log ?? "").replace(ANSI, "").trim().split("\n").slice(-6).join("\n") || "Login failed";
    }
    await provider.destroy(flow.vmName).catch(() => {});
  }

  if (Object.keys(patch).length) {
    await db.update(schema.loginFlows).set(patch).where(eq(schema.loginFlows.id, flowId));
    Object.assign(flow, patch);
  }
  return view();
}
