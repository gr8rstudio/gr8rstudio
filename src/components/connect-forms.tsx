"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveChatGpt, saveClaude } from "@/app/actions/connections";

type Flow = { status: "starting" | "waiting" | "done" | "error"; url: string | null; code: string | null; error: string | null };

export function ChatGptConnect({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, formAction, pending] = useActionState(saveChatGpt, undefined);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function start() {
    setBusy(true);
    setFlow({ status: "starting", url: null, code: null, error: null });
    const res = await fetch("/api/connections/chatgpt", { method: "POST" });
    const { flowId, error } = await res.json();
    if (!flowId) {
      setFlow({ status: "error", url: null, code: null, error: error ?? "Could not start login" });
      setBusy(false);
      return;
    }
    const poll = async () => {
      const r = await fetch(`/api/connections/chatgpt?flow=${flowId}`);
      const f = (await r.json()) as Flow;
      setFlow(f);
      if (f.status === "done") {
        setBusy(false);
        router.refresh();
      } else if (f.status === "error") {
        setBusy(false);
      } else {
        timer.current = setTimeout(poll, 2500);
      }
    };
    poll();
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-xl border border-line bg-bg p-4">
        <p className="text-sm font-medium">Sign in with ChatGPT</p>
        <p className="mt-1 text-xs text-muted">
          We boot a temporary VM, run the official <code className="kbd">codex login --device-auth</code>, and show
          you a one-time code to approve on openai.com.
        </p>
        {!flow || flow.status === "done" || flow.status === "error" ? (
          <button className="btn btn-primary mt-4" onClick={start} disabled={busy}>
            {connected ? "Reconnect ChatGPT" : "Sign in with ChatGPT"}
          </button>
        ) : null}
        {flow?.status === "starting" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Booting login VM & installing Codex…
          </p>
        )}
        {flow?.status === "waiting" && (
          <div className="mt-4 space-y-3">
            {flow.url && flow.code ? (
              <>
                <a href={flow.url} target="_blank" rel="noreferrer" className="btn w-full">
                  1. Open {new URL(flow.url).host} <ExternalLink className="size-3.5" />
                </a>
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 font-mono text-xl tracking-[0.2em] text-accent"
                  onClick={() => navigator.clipboard.writeText(flow.code!)}
                  title="Copy code"
                >
                  {flow.code} <Copy className="size-4" />
                </button>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="size-3.5 animate-spin" /> 2. Enter the code. We&apos;ll detect approval automatically.
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Requesting a one-time code…
              </p>
            )}
          </div>
        )}
        {flow?.status === "done" && <p className="mt-3 text-sm text-ok">ChatGPT connected ✓</p>}
        {flow?.status === "error" && (
          <p className="mt-3 whitespace-pre-wrap text-xs text-danger">
            {flow.error}
            {"\n"}Tip: if device-code login is off, enable it in ChatGPT settings → Security, or paste auth.json instead.
          </p>
        )}
      </div>

      <form action={formAction} className="rounded-xl border border-line bg-bg p-4">
        <p className="text-sm font-medium">Or paste credentials</p>
        <p className="mt-1 text-xs text-muted">
          Run <code className="kbd">codex login</code> on your machine and paste <code className="kbd">~/.codex/auth.json</code>,
          or paste an OpenAI API key.
        </p>
        <textarea name="secret" className="input mt-3 h-24 font-mono text-xs" placeholder='{"tokens": {…}} or sk-…' required />
        {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
        <button className="btn mt-3" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}

export function ClaudeConnect({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(saveClaude, undefined);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-xl border border-line bg-bg p-4 text-sm">
        <p className="font-medium">Use your Claude subscription</p>
        <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs text-muted">
          <li>
            Install Claude Code: <code className="kbd">npm i -g @anthropic-ai/claude-code</code>
          </li>
          <li>
            Run <code className="kbd">claude setup-token</code> and approve in your browser.
          </li>
          <li>
            Paste the long-lived token (<code className="kbd">sk-ant-oat…</code>) here.
          </li>
        </ol>
      </div>
      <form action={formAction} className="rounded-xl border border-line bg-bg p-4">
        <p className="text-sm font-medium">{connected ? "Replace token" : "Paste token"}</p>
        <p className="mt-1 text-xs text-muted">A Claude Code OAuth token, or an Anthropic API key (sk-ant-api…).</p>
        <input name="secret" type="password" className="input mt-3 font-mono text-xs" placeholder="sk-ant-oat01-…" required />
        {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
        <button className="btn btn-primary mt-3" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
