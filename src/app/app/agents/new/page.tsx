import { AgentForm } from "@/components/agent-form";
import { listConnections } from "@/lib/runtime/connections";
import { requireUser } from "@/lib/session";

export default async function NewAgentPage() {
  const user = await requireUser();
  const conns = await listConnections(user.id);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
      <p className="mt-1 text-sm text-muted">It gets its own VM the first time you message it.</p>
      <div className="card mt-6 p-6">
        <AgentForm
          mode="create"
          connected={{ claude: conns.some((c) => c.provider === "claude"), codex: conns.some((c) => c.provider === "chatgpt") }}
        />
      </div>
    </main>
  );
}
