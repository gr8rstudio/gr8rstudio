import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import { ENGINE_LABEL, VmBadge } from "@/components/vm-badge";
import { listAgents } from "@/lib/agents";
import { listConnections } from "@/lib/runtime/connections";
import { requireUser } from "@/lib/session";
import { getVmProvider } from "@/lib/vm";

function ago(d: Date | null) {
  if (!d) return "never";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function AgentsPage() {
  const user = await requireUser();
  const [agents, conns] = await Promise.all([listAgents(user.id), listConnections(user.id)]);
  const provider = getVmProvider();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your agents</h1>
          <p className="mt-1 text-sm text-muted">Each one runs in its own {provider.label}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["chatgpt", "claude"] as const).map((p) => {
              const on = conns.some((c) => c.provider === p);
              return (
                <Link key={p} href="/app/connections" className={`badge ${on ? "border-ok/30 text-ok" : "hover:text-text"}`}>
                  <span className={`size-1.5 rounded-full ${on ? "bg-ok" : "bg-[#55555f]"}`} />
                  {p === "chatgpt" ? "ChatGPT" : "Claude"} {on ? "connected" : "not connected"}
                </Link>
              );
            })}
          </div>
        </div>
        <Link href="/app/agents/new" className="btn btn-primary"><Plus className="size-4" /> New agent</Link>
      </div>

      {!provider.isolated && (
        <div className="mt-6 flex gap-3 rounded-xl border border-[#4a3a10] bg-[#1f1a0b] p-4 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Dev mode: VM_PROVIDER=local runs agents as plain processes on this machine, with no isolation.
            Set <code className="kbd">VM_PROVIDER=vercel</code> for real microVMs.
          </p>
        </div>
      )}

      {conns.length === 0 && (
        <Link href="/app/connections" className="card mt-6 flex items-center justify-between gap-4 p-5 transition hover:border-accent/50">
          <div>
            <p className="font-medium">Connect ChatGPT or Claude</p>
            <p className="mt-1 text-sm text-muted">Agents run on your own subscription. Connect one to get started.</p>
          </div>
          <span className="btn">Connect →</span>
        </Link>
      )}

      {agents.length === 0 ? (
        <div className="card mt-6 grid place-items-center px-6 py-20 text-center">
          <div className="text-5xl">🤖</div>
          <h2 className="mt-4 text-lg font-medium">No agents yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Create an agent, give it a persona, and it gets its own VM the first time you talk to it.
          </p>
          <Link href="/app/agents/new" className="btn btn-primary mt-6">Create an agent</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <Link key={a.id} href={`/app/agents/${a.id}`} className="card group p-5 transition hover:border-accent/50">
              <div className="flex items-start justify-between gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-panel-2 text-2xl">{a.emoji}</div>
                <VmBadge status={a.vmStatus} />
              </div>
              <h3 className="mt-4 font-medium group-hover:text-accent">{a.name}</h3>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">{a.persona || "No persona yet."}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span>{ENGINE_LABEL[a.engine]}{a.model ? ` · ${a.model}` : ""}{a.telegramUsername ? " · Telegram" : ""}</span>
                <span>{ago(a.lastActiveAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
