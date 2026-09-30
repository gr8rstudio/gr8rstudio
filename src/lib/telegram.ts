import "server-only";

const API = "https://api.telegram.org";

export async function tg<T = unknown>(token: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

export async function sendTelegramText(token: string, chatId: string, text: string) {
  const chunks: string[] = [];
  let rest = text || "(empty reply)";
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 4000));
    rest = rest.slice(4000);
  }
  for (const chunk of chunks) {
    await tg(token, "sendMessage", { chat_id: chatId, text: chunk });
  }
}
