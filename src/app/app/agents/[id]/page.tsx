import { notFound } from "next/navigation";
import { AgentWorkspace, type ChatMessage } from "@/components/agent-workspace";
import { getAgent, listMessages } from "@/lib/agents";
import type { MessagePart } from "@/lib/events";
import { listConnections } from "@/lib/runtime/connections";
import { requireUser } from "@/lib/session";
import { getVmProvider } from "@/lib/vm";

// VM boot (tool install) runs inside a server action on this page.
export const maxDuration = 300;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const agent = await getAgent(user.id, id);
  if (!agent) notFound();
  const [rows, conns] = await Promise.all([listMessages(agent.id), listConnections(user.id)]);
  const provider = getVmProvider(agent.vmProvider);

  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: m.parts ? (JSON.parse(m.parts) as MessagePart[]) : null,
    meta: m.meta ? JSON.parse(m.meta) : null,
    channel: m.channel,
  }));

  return (
    <AgentWorkspace
      agent={{
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        persona: agent.persona,
        engine: agent.engine,
        model: agent.model,
        vmStatus: agent.vmStatus,
        vmError: agent.vmError,
        telegramUsername: agent.telegramUsername,
        telegramPairCode: agent.telegramPairCode,
        telegramPaired: Boolean(agent.telegramChatId),
      }}
      provider={{ label: provider.label, isolated: provider.isolated }}
      connected={{ claude: conns.some((c) => c.provider === "claude"), codex: conns.some((c) => c.provider === "chatgpt") }}
      initialMessages={messages}
    />
  );
}
