import { truncate, type AgentEvent } from "../events";
import { parseJsonLine, type Engine, type PreparedCredential } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  const pick =
    input.command ?? input.file_path ?? input.path ?? input.url ?? input.query ?? input.pattern ??
    input.description ?? input.prompt;
  if (typeof pick === "string") return truncate(pick, 500);
  return truncate(JSON.stringify(input), 500);
}

function toolResultText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c?.type === "text" ? c.text : c?.type ? `[${c.type}]` : ""))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

/** Parser for `claude -p --output-format stream-json --verbose --include-partial-messages`. */
export function createClaudeParser() {
  const streamed = new Set<string>(); // assistant message ids whose text arrived as deltas
  let currentMsg: string | null = null;
  let sawText = false;

  return {
    push(line: string): AgentEvent[] {
      const ev = parseJsonLine(line) as any;
      if (!ev) return [];
      const out: AgentEvent[] = [];
      switch (ev.type) {
        case "system":
          if (ev.subtype === "init" && ev.session_id) out.push({ type: "session", id: ev.session_id });
          break;
        case "stream_event": {
          const e = ev.event;
          if (e?.type === "message_start") currentMsg = e.message?.id ?? null;
          if (e?.type === "content_block_start" && e.content_block?.type === "text" && sawText) {
            out.push({ type: "text", delta: "\n\n" });
          }
          if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
            if (currentMsg) streamed.add(currentMsg);
            sawText = true;
            out.push({ type: "text", delta: e.delta.text });
          }
          break;
        }
        case "assistant": {
          const msg = ev.message ?? {};
          for (const block of msg.content ?? []) {
            if (block.type === "text" && block.text && !streamed.has(msg.id)) {
              out.push({ type: "text", delta: (sawText ? "\n\n" : "") + block.text });
              sawText = true;
            } else if (block.type === "tool_use") {
              out.push({
                type: "tool",
                id: block.id,
                name: block.name,
                input: summarizeToolInput(block.name, block.input),
              });
            }
          }
          break;
        }
        case "user": {
          for (const block of ev.message?.content ?? []) {
            if (block?.type === "tool_result") {
              out.push({
                type: "tool_result",
                id: block.tool_use_id,
                output: truncate(toolResultText(block.content)),
                isError: Boolean(block.is_error),
              });
            }
          }
          break;
        }
        case "result": {
          if (ev.session_id) out.push({ type: "session", id: ev.session_id });
          if (ev.is_error || (ev.subtype && ev.subtype !== "success")) {
            out.push({
              type: "error",
              message:
                (typeof ev.result === "string" && ev.result) ||
                (Array.isArray(ev.errors) && ev.errors.join("; ")) ||
                `Claude run ended: ${ev.subtype ?? "error"}`,
            });
          } else {
            out.push({
              type: "done",
              costUsd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : undefined,
              usage: ev.usage
                ? {
                    input_tokens: ev.usage.input_tokens ?? 0,
                    output_tokens: ev.usage.output_tokens ?? 0,
                  }
                : undefined,
            });
          }
          break;
        }
      }
      return out;
    },
  };
}

export const claudeEngine: Engine = {
  id: "claude",
  label: "Claude (Claude Code)",
  provider: "claude",
  personaFile: "CLAUDE.md",
  command({ prompt, sessionId, model, paths }) {
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
    ];
    if (sessionId) args.push("--resume", sessionId);
    if (model) args.push("--model", model);
    args.push("--", prompt);
    return { cmd: paths.bin("claude"), args };
  },
  env(paths) {
    return {
      CLAUDE_CONFIG_DIR: paths.claudeDir,
      IS_SANDBOX: "1", // the VM is the sandbox; allows skip-permissions as root
      DISABLE_AUTOUPDATER: "1",
    };
  },
  credentials(cred): PreparedCredential {
    if (cred.kind === "oauth_token") return { env: { CLAUDE_CODE_OAUTH_TOKEN: cred.secret }, files: [] };
    if (cred.kind === "api_key") return { env: { ANTHROPIC_API_KEY: cred.secret }, files: [] };
    throw new Error(`Unsupported Claude credential: ${cred.kind}`);
  },
  createParser: createClaudeParser,
};
