"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "./auth";
import { deleteCredential, saveCredential } from "@/lib/runtime/connections";
import { requireUser } from "@/lib/session";
import type { Provider } from "@/lib/db/schema";

export async function saveClaude(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const secret = String(form.get("secret") ?? "").trim();
  if (secret.startsWith("sk-ant-oat")) {
    await saveCredential(user.id, "claude", "oauth_token", secret, "Claude subscription (setup-token)");
  } else if (secret.startsWith("sk-ant-api")) {
    await saveCredential(user.id, "claude", "api_key", secret, `Anthropic API key …${secret.slice(-4)}`);
  } else {
    return { error: "Paste a token from `claude setup-token` (sk-ant-oat…) or an Anthropic API key (sk-ant-api…)." };
  }
  revalidatePath("/app/connections");
  return {};
}

export async function saveChatGpt(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const secret = String(form.get("secret") ?? "").trim();
  if (secret.startsWith("{")) {
    let parsed: { tokens?: { refresh_token?: string }; OPENAI_API_KEY?: string | null };
    try {
      parsed = JSON.parse(secret);
    } catch {
      return { error: "That doesn't look like valid JSON. Paste the whole ~/.codex/auth.json file." };
    }
    if (!parsed.tokens?.refresh_token && !parsed.OPENAI_API_KEY) {
      return { error: "auth.json has no ChatGPT tokens. Run `codex login` first." };
    }
    await saveCredential(user.id, "chatgpt", "auth_json", secret, "ChatGPT account (auth.json)");
  } else if (secret.startsWith("sk-")) {
    await saveCredential(user.id, "chatgpt", "api_key", secret, `OpenAI API key …${secret.slice(-4)}`);
  } else {
    return { error: "Paste your ~/.codex/auth.json or an OpenAI API key (sk-…)." };
  }
  revalidatePath("/app/connections");
  return {};
}

export async function disconnect(provider: Provider) {
  const user = await requireUser();
  await deleteCredential(user.id, provider);
  revalidatePath("/app/connections");
}
