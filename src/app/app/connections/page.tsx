import { CheckCircle2 } from "lucide-react";
import { disconnect } from "@/app/actions/connections";
import { ChatGptConnect, ClaudeConnect } from "@/components/connect-forms";
import { listConnections } from "@/lib/runtime/connections";
import { requireUser } from "@/lib/session";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const conns = await listConnections(user.id);
  const chatgpt = conns.find((c) => c.provider === "chatgpt");
  const claude = conns.find((c) => c.provider === "claude");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{welcome ? "Welcome! Connect your AI" : "Connections"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Your agents run the official ChatGPT (Codex) and Claude (Claude Code) agents inside their own VMs, on
        your own plan. Credentials are encrypted and only written into your agents&apos; VMs.
      </p>

      <div className="mt-8 grid gap-6">
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <span className="grid size-8 place-items-center rounded-lg bg-[#10a37f] text-sm font-bold text-white">✦</span>
                ChatGPT
              </h2>
              <p className="mt-1 text-sm text-muted">Plus, Pro, Business or Enterprise, via Sign in with ChatGPT. Or an OpenAI API key.</p>
            </div>
            {chatgpt && <Connected label={chatgpt.label} provider="chatgpt" />}
          </div>
          <div className="mt-5">
            <ChatGptConnect connected={Boolean(chatgpt)} />
          </div>
        </section>

        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <span className="grid size-8 place-items-center rounded-lg bg-[#d97757] text-sm font-bold text-white">✳</span>
                Claude
              </h2>
              <p className="mt-1 text-sm text-muted">Pro or Max subscription via a Claude Code token. Or an Anthropic API key.</p>
            </div>
            {claude && <Connected label={claude.label} provider="claude" />}
          </div>
          <div className="mt-5">
            <ClaudeConnect connected={Boolean(claude)} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Connected({ label, provider }: { label: string | null; provider: "claude" | "chatgpt" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="badge border-ok/30 text-ok">
        <CheckCircle2 className="size-3.5" /> {label ?? "Connected"}
      </span>
      <form action={disconnect.bind(null, provider)}>
        <button className="btn btn-ghost text-xs">Disconnect</button>
      </form>
    </div>
  );
}
