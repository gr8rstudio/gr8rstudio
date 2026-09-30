import { after } from "next/server";
import { launchChatGptLogin, pollChatGptLogin, startChatGptLogin } from "@/lib/runtime/chatgpt-login";
import { currentUser } from "@/lib/session";

export const maxDuration = 300;

export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const flowId = await startChatGptLogin(user.id);
  after(() => launchChatGptLogin(flowId));
  return Response.json({ flowId });
}

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const flowId = new URL(req.url).searchParams.get("flow");
  if (!flowId) return Response.json({ error: "Missing flow" }, { status: 400 });
  try {
    const view = await pollChatGptLogin(user.id, flowId);
    if (!view) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(view);
  } catch (e) {
    return Response.json({ status: "error", error: (e as Error).message }, { status: 200 });
  }
}
