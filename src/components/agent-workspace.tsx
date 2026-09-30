"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileText,
  Loader2,
  Power,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  connectTelegram,
  deleteAgent,
  disconnectTelegram,
  newConversation,
  vmAction,
  type VmAction,
} from "@/app/actions/agents";
import type { EngineId, MessageRole, VmStatus } from "@/lib/db/schema";
import { applyEvent, type AgentEvent, type MessagePart } from "@/lib/events";
import { AgentForm } from "./agent-form";
import { Markdown } from "./markdown";
import { ENGINE_LABEL, VmBadge } from "./vm-badge";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  parts: MessagePart[] | null;
  meta: { error?: string | null; costUsd?: number; usage?: Record<string, number> } | null;
  channel: string;
};

type AgentView = {
  id: string;
  name: string;
  emoji: string;
  persona: string;
  engine: EngineId;
  model: string | null;
  vmStatus: VmStatus;
  vmError: string | null;
  telegramUsername: string | null;
  telegramPairCode: string | null;
  telegramPaired: boolean;
};

type Tab = "vm" | "files" | "settings" | "telegram";

export function AgentWorkspace({
  agent,
  provider,
  connected,
  initialMessages,
}: {
  agent: AgentView;
  provider: { label: string; isolated: boolean };
  connected: { claude: boolean; codex: boolean };
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [live, setLive] = useState<{ parts: MessagePart[]; status: string } | null>(null);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<Tab>("vm");
  const [panelOpen, setPanelOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const hasConnection = agent.engine === "claude" ? connected.claude : connected.codex;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  async function send() {
    const text = input.trim();
    if (!text || live) return;
    setInput("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: text, parts: null, meta: null, channel: "web" }]);
    setLive({ parts: [], status: "Sending…" });

    let parts: MessagePart[] = [];
    let error: string | null = null;
    let done: Extract<AgentEvent, { type: "done" }> | null = null;
    try {
      const res = await fetch(`/api/agents/${agent.id}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += value;
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const ev = JSON.parse(frame.slice(6)) as AgentEvent;
          if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.message } : l));
          else if (ev.type === "error") error = ev.message;
          else if (ev.type === "done") done = ev;
          else {
            parts = applyEvent(parts, ev);
            const snapshot = parts;
            setLive((l) => ({ status: l?.status === "Thinking…" || !l ? "Working…" : l.status, parts: snapshot }));
          }
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
    const finalDone = done as Extract<AgentEvent, { type: "done" }> | null;
    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "",
        parts,
        meta: { error, costUsd: finalDone?.costUsd, usage: finalDone?.usage },
        channel: "web",
      },
    ]);
    setLive(null);
    router.refresh(); // VM status, last active
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-0 sm:px-6 lg:py-6">
      {/* Chat */}
      <section className="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col lg:card lg:h-[calc(100dvh-6.5rem)] lg:overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="grid size-10 place-items-center rounded-xl bg-panel-2 text-xl">{agent.emoji}</div>
          <div className="min-w-0">
            <h1 className="truncate font-medium">{agent.name}</h1>
            <p className="truncate text-xs text-muted">
              {ENGINE_LABEL[agent.engine]}
              {agent.model ? ` · ${agent.model}` : ""} · {provider.label}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <VmBadge status={agent.vmStatus} />
            <button className="btn btn-ghost lg:hidden" onClick={() => setPanelOpen(true)} aria-label="Agent settings">
              <Settings className="size-4" />
            </button>
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !live && (
            <div className="mx-auto mt-10 max-w-md text-center">
              <div className="text-5xl">{agent.emoji}</div>
              <p className="mt-4 font-medium">Say hi to {agent.name}</p>
              <p className="mt-1 text-sm text-muted">
                The first message boots {agent.name}&apos;s VM and installs its tools. That takes about a minute, once.
              </p>
              {!hasConnection && (
                <Link href="/app/connections" className="btn btn-primary mt-5">
                  Connect {agent.engine === "claude" ? "Claude" : "ChatGPT"} first
                </Link>
              )}
            </div>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} m={m} />
          ))}
          {live && (
            <div className="space-y-3">
              <Parts parts={live.parts} />
              <p className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" /> {live.status}
              </p>
            </div>
          )}
        </div>

        <form
          className="border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border border-line bg-bg p-2 focus-within:border-accent/50">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={live ? `${agent.name} is working…` : `Message ${agent.name}`}
              className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none field-sizing-content placeholder:text-[#5c5c66]"
            />
            <button className="btn btn-primary size-9 p-0" disabled={!input.trim() || Boolean(live)} aria-label="Send">
              {live ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </form>
      </section>

      {/* Side panel */}
      <aside
        className={`${panelOpen ? "fixed inset-0 z-30 flex" : "hidden"} flex-col bg-bg lg:static lg:z-auto lg:flex lg:w-80 lg:shrink-0 lg:bg-transparent`}
      >
        <div className="flex items-center gap-1 border-b border-line p-2 lg:rounded-t-2xl lg:border lg:bg-panel">
          {(
            [
              ["vm", "VM", Terminal],
              ["files", "Files", FileText],
              ["settings", "Agent", Settings],
              ["telegram", "Telegram", Send],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition ${
                tab === id ? "bg-panel-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
          <button className="btn btn-ghost p-1.5 lg:hidden" onClick={() => setPanelOpen(false)} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:max-h-[calc(100dvh-10rem)] lg:rounded-b-2xl lg:border lg:border-t-0 lg:border-line lg:bg-panel">
          {tab === "vm" && <VmPanel agent={agent} provider={provider} busy={Boolean(live)} />}
          {tab === "files" && <FilesPanel agentId={agent.id} vmStatus={agent.vmStatus} />}
          {tab === "settings" && <SettingsPanel agent={agent} connected={connected} />}
          {tab === "telegram" && <TelegramPanel agent={agent} />}
        </div>
      </aside>
    </div>
  );
}

function MessageView({ m }: { m: ChatMessage }) {
  if (m.role === "system") {
    return (
      <div className="flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-line" />
        {m.content}
        <div className="h-px flex-1 bg-line" />
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-panel-2 px-4 py-2.5 text-sm">
          {m.content}
          {m.channel === "telegram" && <span className="ml-2 text-[10px] text-muted">via Telegram</span>}
        </div>
      </div>
    );
  }
  const parts = m.parts ?? (m.content ? [{ kind: "text" as const, text: m.content }] : []);
  return (
    <div className="space-y-3">
      <Parts parts={parts} />
      {m.meta?.error && (
        <div className="whitespace-pre-wrap rounded-lg border border-[#4a2020] bg-[#1f1010] px-3 py-2 font-mono text-xs text-danger">
          {m.meta.error}
        </div>
      )}
      {(m.meta?.usage || m.channel === "telegram") && (
        <p className="text-[11px] text-[#5c5c66]">
          {m.channel === "telegram" ? "via Telegram · " : ""}
          {m.meta?.usage ? `${m.meta.usage.input_tokens ?? 0} in / ${m.meta.usage.output_tokens ?? 0} out tokens` : ""}
        </p>
      )}
    </div>
  );
}

function Parts({ parts }: { parts: MessagePart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <Markdown key={i}>{p.text}</Markdown>
        ) : (
          <details key={p.id} className="group rounded-lg border border-line bg-panel text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted">
              <ChevronRight className="size-3.5 transition group-open:rotate-90" />
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  p.output === undefined ? "animate-pulse bg-warn" : p.isError ? "bg-danger" : "bg-ok"
                }`}
              />
              <span className="font-medium text-text">{p.name}</span>
              <span className="truncate font-mono">{p.input.split("\n")[0]}</span>
            </summary>
            <div className="space-y-2 border-t border-line p-3">
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-muted">{p.input}</pre>
              {p.output !== undefined && p.output !== "" && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 font-mono text-[11px]">
                  {p.output}
                </pre>
              )}
            </div>
          </details>
        ),
      )}
    </>
  );
}

function VmPanel({ agent, provider, busy }: { agent: AgentView; provider: { label: string; isolated: boolean }; busy: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: VmAction) => {
    if (action === "reset" && !confirm(`Reset ${agent.name}'s VM? This wipes its disk (workspace, memory, sessions).`)) return;
    setError(null);
    start(async () => {
      const res = await vmAction(agent.id, action);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="label">Machine</p>
        <p>{provider.label}</p>
        <p className="mt-1 text-xs text-muted">
          {provider.isolated
            ? "Private microVM with a persistent disk. Sleeps when idle and wakes on your next message."
            : "Dev mode: a folder on the server, not isolated."}
        </p>
      </div>
      <div>
        <p className="label">Status</p>
        <VmBadge status={agent.vmStatus} />
        {agent.vmError && <p className="mt-2 whitespace-pre-wrap font-mono text-xs text-danger">{agent.vmError}</p>}
      </div>
      <div className="grid gap-2">
        <button className="btn justify-start" disabled={pending || busy} onClick={() => run("boot")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
          {agent.vmStatus === "ready" ? "Re-sync tools & persona" : "Boot VM now"}
        </button>
        <button className="btn justify-start" disabled={pending || busy || agent.vmStatus === "none"} onClick={() => run("sleep")}>
          <RefreshCw className="size-4" /> Put to sleep
        </button>
        <button className="btn btn-danger justify-start" disabled={pending || busy} onClick={() => run("reset")}>
          <RotateCcw className="size-4" /> Reset VM (wipe disk)
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="rounded-lg border border-line bg-bg p-3 text-xs text-muted">
        Layout: <code className="kbd">workspace/</code> (cwd, persona, <code className="kbd">memory/</code>),{" "}
        <code className="kbd">tools/</code> (CLIs), <code className="kbd">.claude/</code>, <code className="kbd">.codex/</code>.
      </div>
    </div>
  );
}

function FilesPanel({ agentId, vmStatus }: { agentId: string; vmStatus: VmStatus }) {
  const [files, setFiles] = useState<{ path: string; size: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ path: string; content: string } | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (vmStatus === "none") return;
    let cancelled = false;
    fetch(`/api/agents/${agentId}/files`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setError(j.error ?? null);
        setFiles(j.error ? [] : j.files);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [agentId, vmStatus, version]);
  const load = () => {
    setFiles(null);
    setVersion((v) => v + 1);
  };

  if (vmStatus === "none") return <p className="text-sm text-muted">No VM yet. Send a message or boot it.</p>;
  if (open)
    return (
      <div className="space-y-2">
        <button className="btn btn-ghost -ml-2 text-xs" onClick={() => setOpen(null)}>← Files</button>
        <p className="break-all font-mono text-xs">{open.path}</p>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-bg p-3 font-mono text-[11px]">
          {open.content}
        </pre>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="label mb-0">workspace/</p>
        <button className="btn btn-ghost p-1.5" onClick={load} aria-label="Refresh"><RefreshCw className="size-3.5" /></button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!files && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" /> Reading VM disk…</p>}
      {files?.length === 0 && <p className="text-xs text-muted">Empty.</p>}
      <ul className="space-y-0.5">
        {files?.map((f) => (
          <li key={f.path}>
            <button
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-panel-2"
              onClick={async () => {
                const r = await fetch(`/api/agents/${agentId}/files?path=${encodeURIComponent(f.path)}`);
                const j = await r.json();
                setOpen({ path: f.path, content: j.content ?? j.error ?? "" });
              }}
            >
              <span className="truncate">{f.path}</span>
              <span className="shrink-0 text-muted">{f.size < 1024 ? `${f.size}B` : `${Math.round(f.size / 1024)}K`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPanel({ agent, connected }: { agent: AgentView; connected: { claude: boolean; codex: boolean } }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <AgentForm mode="edit" agent={agent} connected={connected} />
      <div className="space-y-2 border-t border-line pt-4">
        <button className="btn w-full" disabled={pending} onClick={() => start(() => newConversation(agent.id))}>
          <RotateCcw className="size-4" /> Start a new conversation
        </button>
        <button
          className="btn btn-danger w-full"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete ${agent.name}? Its VM and history are destroyed.`)) start(() => deleteAgent(agent.id));
          }}
        >
          <Trash2 className="size-4" /> Delete agent
        </button>
      </div>
    </div>
  );
}

function TelegramPanel({ agent }: { agent: AgentView }) {
  const [state, formAction, pending] = useActionState(connectTelegram.bind(null, agent.id), undefined);
  const [dPending, start] = useTransition();
  if (!agent.telegramUsername) {
    return (
      <form action={formAction} className="space-y-3 text-sm">
        <p>Give {agent.name} its own Telegram bot.</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
          <li>Message <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> → <code className="kbd">/newbot</code></li>
          <li>Paste the bot token below.</li>
          <li>Pair it with your Telegram account using the code we show.</li>
        </ol>
        <input name="token" className="input font-mono text-xs" placeholder="123456:ABC-DEF…" required />
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Connecting…" : "Connect bot"}</button>
      </form>
    );
  }
  return (
    <div className="space-y-4 text-sm">
      <p>
        Bot: <a className="text-accent underline" href={`https://t.me/${agent.telegramUsername}`} target="_blank" rel="noreferrer">@{agent.telegramUsername}</a>
      </p>
      {agent.telegramPaired ? (
        <p className="text-ok">Paired with your Telegram ✓. Only you can talk to it.</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs text-muted">Pair your Telegram account (one-time):</p>
          <a
            className="btn btn-primary w-full"
            href={`https://t.me/${agent.telegramUsername}?start=${agent.telegramPairCode}`}
            target="_blank"
            rel="noreferrer"
          >
            Open bot & pair
          </a>
          <p className="text-xs text-muted">
            or send <code className="kbd">/pair {agent.telegramPairCode}</code> to the bot.
          </p>
        </div>
      )}
      <button className="btn btn-ghost w-full" disabled={dPending} onClick={() => start(() => disconnectTelegram(agent.id))}>
        Disconnect bot
      </button>
    </div>
  );
}
