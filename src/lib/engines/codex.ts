import { truncate, type AgentEvent } from "../events";
import { parseJsonLine, type Engine, type PreparedCredential } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Parser for `codex exec --json` (JSONL thread/turn/item events). */
export function createCodexParser() {
  const started = new Set<string>();
  let lastWasText = false;

  const toolStart = (item: any): AgentEvent | null => {
    switch (item.type) {
      case "command_execution":
        return { type: "tool", id: item.id, name: "shell", input: truncate(String(item.command ?? ""), 500) };
      case "file_change":
        return {
          type: "tool",
          id: item.id,
          name: "edit",
          input: (item.changes ?? []).map((c: any) => `${c.kind ?? "update"} ${c.path}`).join("\n"),
        };
      case "mcp_tool_call":
        return { type: "tool", id: item.id, name: `${item.server}.${item.tool}`, input: truncate(JSON.stringify(item.arguments ?? {}), 500) };
      case "web_search":
        return { type: "tool", id: item.id, name: "web_search", input: String(item.query ?? "") };
      default:
        return null;
    }
  };

  return {
    push(line: string): AgentEvent[] {
      const ev = parseJsonLine(line) as any;
      if (!ev) return [];
      const out: AgentEvent[] = [];
      const emit = (e: AgentEvent) => {
        out.push(e);
        lastWasText = e.type === "text";
      };
      switch (ev.type) {
        case "thread.started":
          if (ev.thread_id) emit({ type: "session", id: ev.thread_id });
          break;
        case "item.started": {
          const t = ev.item && toolStart(ev.item);
          if (t) {
            started.add(ev.item.id);
            emit(t);
          }
          break;
        }
        case "item.completed": {
          const item = ev.item ?? {};
          if (item.type === "agent_message" && item.text) {
            emit({ type: "text", delta: (lastWasText ? "\n\n" : "") + item.text });
            break;
          }
          if (item.type === "error" && item.message) {
            emit({ type: "status", message: item.message });
            break;
          }
          const t = toolStart(item);
          if (!t) break;
          if (!started.has(item.id)) emit(t);
          let output = "";
          let isError = item.status === "failed";
          if (item.type === "command_execution") {
            output = truncate(String(item.aggregated_output ?? ""));
            isError = typeof item.exit_code === "number" ? item.exit_code !== 0 : isError;
          } else if (item.type === "mcp_tool_call") {
            output = truncate(item.error?.message ?? JSON.stringify(item.result ?? ""));
          }
          emit({ type: "tool_result", id: item.id, output, isError });
          break;
        }
        case "turn.completed":
          emit({
            type: "done",
            usage: ev.usage
              ? { input_tokens: ev.usage.input_tokens ?? 0, output_tokens: ev.usage.output_tokens ?? 0 }
              : undefined,
          });
          break;
        case "turn.failed":
          emit({ type: "error", message: ev.error?.message ?? "Codex turn failed" });
          break;
        case "error":
          emit({ type: "error", message: ev.message ?? "Codex error" });
          break;
      }
      return out;
    },
  };
}

export const codexEngine: Engine = {
  id: "codex",
  label: "ChatGPT (Codex)",
  provider: "chatgpt",
  personaFile: "AGENTS.md",
  command({ prompt, sessionId, model, paths }) {
    const args = ["exec"];
    if (sessionId) args.push("resume", sessionId);
    args.push("--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox");
    if (model) args.push("-m", model);
    args.push("--", prompt);
    return { cmd: paths.bin("codex"), args };
  },
  env(paths) {
    return { CODEX_HOME: paths.codexDir };
  },
  credentials(cred, paths): PreparedCredential {
    const authPath = `${paths.codexDir}/auth.json`;
    if (cred.kind === "auth_json") {
      return { env: {}, files: [{ path: authPath, content: cred.secret, mode: 0o600 }] };
    }
    if (cred.kind === "api_key") {
      return {
        env: { CODEX_API_KEY: cred.secret, OPENAI_API_KEY: cred.secret },
        files: [{ path: authPath, content: JSON.stringify({ OPENAI_API_KEY: cred.secret }), mode: 0o600 }],
      };
    }
    throw new Error(`Unsupported ChatGPT credential: ${cred.kind}`);
  },
  createParser: createCodexParser,
};
