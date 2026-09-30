"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createAgent, updateAgent } from "@/app/actions/agents";
import type { Agent } from "@/lib/db/schema";

const TEMPLATES = [
  {
    emoji: "🧭",
    name: "Chief of Staff",
    persona:
      "You are my chief of staff. Keep track of my priorities, turn messy thoughts into clear plans and todo lists, draft emails and docs, and remind me what matters. Keep a running task list in memory/tasks.md.",
  },
  {
    emoji: "🔬",
    name: "Researcher",
    persona:
      "You are a meticulous research analyst. Search the web, read primary sources, compare options and give crisp answers with sources. Save reports as markdown files in reports/.",
  },
  {
    emoji: "🛠️",
    name: "Builder",
    persona:
      "You are a senior full-stack engineer. Build working prototypes, scripts and tools in your VM, run and test them, and explain what you did briefly. Keep projects in projects/<name>/.",
  },
  {
    emoji: "📈",
    name: "Growth",
    persona:
      "You are a growth marketer for a design & dev studio. Write punchy launch posts, landing page copy, cold outreach and content calendars. Match a confident, founder-led voice.",
  },
];

const EMOJIS = ["🤖", "🧭", "🔬", "🛠️", "📈", "🦊", "🐙", "⚡", "🧠", "🎯", "🪄", "🚀"];

export function AgentForm({
  mode,
  agent,
  connected,
}: {
  mode: "create" | "edit";
  agent?: Pick<Agent, "id" | "name" | "emoji" | "persona" | "engine" | "model">;
  connected: { claude: boolean; codex: boolean };
}) {
  const action = mode === "create" ? createAgent : updateAgent.bind(null, agent!.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [emoji, setEmoji] = useState(agent?.emoji ?? "🤖");
  const [name, setName] = useState(agent?.name ?? "");
  const [persona, setPersona] = useState(agent?.persona ?? "");
  const [engine, setEngine] = useState<"claude" | "codex">(
    agent?.engine ?? (connected.codex && !connected.claude ? "codex" : "claude"),
  );

  return (
    <form action={formAction} className="space-y-6">
      {mode === "create" && (
        <div>
          <span className="label">Start from a template</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.name}
                onClick={() => {
                  setEmoji(t.emoji);
                  setName(t.name);
                  setPersona(t.persona);
                }}
                className="rounded-xl border border-line bg-bg p-3 text-left text-sm transition hover:border-accent/50"
              >
                <div className="text-xl">{t.emoji}</div>
                <div className="mt-1 font-medium">{t.name}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <span className="label">Icon</span>
          <input type="hidden" name="emoji" value={emoji} />
          <div className="grid grid-cols-6 gap-1 sm:w-56">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`grid aspect-square place-items-center rounded-lg text-lg transition ${
                  emoji === e ? "bg-accent/15 ring-1 ring-accent/60" : "hover:bg-panel-2"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlas" required maxLength={40} />
        </div>
      </div>

      <div>
        <span className="label">Brain</span>
        <input type="hidden" name="engine" value={engine} />
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "claude", title: "Claude", sub: "Claude Code · your Claude plan", ok: connected.claude },
              { id: "codex", title: "ChatGPT", sub: "Codex · your ChatGPT plan", ok: connected.codex },
            ] as const
          ).map((o) => (
            <button
              type="button"
              key={o.id}
              onClick={() => setEngine(o.id)}
              className={`rounded-xl border p-4 text-left transition ${
                engine === o.id ? "border-accent/70 bg-accent/5" : "border-line bg-bg hover:border-[#3a3a44]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.title}</span>
                <span className={`text-xs ${o.ok ? "text-ok" : "text-muted"}`}>{o.ok ? "connected" : "not connected"}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{o.sub}</div>
            </button>
          ))}
        </div>
        {!(engine === "claude" ? connected.claude : connected.codex) && (
          <p className="mt-2 text-xs text-warn">
            You can create it now, but <Link href="/app/connections" className="underline">connect {engine === "claude" ? "Claude" : "ChatGPT"}</Link> before chatting.
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="model">Model <span className="normal-case tracking-normal">(optional)</span></label>
        <input
          id="model"
          name="model"
          className="input font-mono"
          defaultValue={agent?.model ?? ""}
          placeholder={engine === "claude" ? "default · e.g. opus, sonnet" : "default · e.g. gpt-5-codex"}
        />
      </div>

      <div>
        <label className="label" htmlFor="persona">Persona & job</label>
        <textarea
          id="persona"
          name="persona"
          className="input h-40"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Who is this agent, what's its job, how should it talk to you?"
        />
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {mode === "edit" && state && !state.error && <p className="text-sm text-ok">Saved. Takes effect on the next message.</p>}
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
      </button>
    </form>
  );
}
