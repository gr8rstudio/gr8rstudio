import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClaudeParser, claudeEngine } from "@/lib/engines/claude";
import { createCodexParser, codexEngine } from "@/lib/engines/codex";
import { vmPaths } from "@/lib/engines/types";
import { applyEvent, partsToText, type AgentEvent, type MessagePart } from "@/lib/events";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8").split("\n");

function runAll(parser: { push(l: string): AgentEvent[] }, lines: string[]) {
  const events = lines.flatMap((l) => parser.push(l));
  const parts = events.reduce<MessagePart[]>(applyEvent, []);
  return { events, parts };
}

describe("claude stream-json parser", () => {
  it("streams text once, captures tools, session and cost", () => {
    const { events, parts } = runAll(createClaudeParser(), fixture("claude-stream.jsonl"));
    expect(events.find((e) => e.type === "session")).toEqual({ type: "session", id: "40f31631-21e4-45c6-96c8-a27b6c2c5e42" });
    expect(parts).toEqual([
      { kind: "text", text: "Let me check." },
      { kind: "tool", id: "toolu_1", name: "Bash", input: "ls memory", output: "notes.md", isError: false },
      { kind: "text", text: "Hi! What are you working on today?" },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", costUsd: 0.003236, usage: { input_tokens: 2, output_tokens: 13 } });
  });

  it("falls back to full assistant messages when partials are absent", () => {
    const lines = fixture("claude-stream.jsonl").filter((l) => !l.includes('"stream_event"'));
    const { parts } = runAll(createClaudeParser(), lines);
    expect(partsToText(parts)).toBe("Let me check.\n\nHi! What are you working on today?");
  });

  it("reports errors from result lines", () => {
    const [ev] = createClaudeParser().push(
      JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Invalid API key · Please run /login" }),
    );
    expect(ev).toEqual({ type: "error", message: "Invalid API key · Please run /login" });
  });

  it("builds a resumable, flag-safe command", () => {
    const cmd = claudeEngine.command({ prompt: "-rf /", sessionId: "s1", model: "opus", paths: vmPaths("/r") });
    expect(cmd.cmd).toBe("/r/tools/node_modules/.bin/claude");
    expect(cmd.args.slice(-2)).toEqual(["--", "-rf /"]);
    expect(cmd.args).toContain("--resume");
    expect(claudeEngine.credentials({ kind: "oauth_token", secret: "sk-ant-oat01-x" }, vmPaths("/r")).env).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-x",
    });
  });
});

describe("codex exec --json parser", () => {
  it("maps items to tools and text", () => {
    const { events, parts } = runAll(createCodexParser(), fixture("codex-stream.jsonl"));
    expect(events[0]).toEqual({ type: "session", id: "0199a213-81c0-7800-8aa1-bbab2a035a53" });
    expect(parts).toMatchObject([
      { kind: "tool", name: "shell", isError: true, output: expect.stringContaining("No such file") },
      { kind: "tool", name: "edit", input: "add /vercel/sandbox/workspace/memory/notes.md", isError: false },
      { kind: "text", text: "Created your notes file.\n\nAnything else?" },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", usage: { input_tokens: 24763, output_tokens: 122 } });
  });

  it("resumes threads and writes auth.json for ChatGPT logins", () => {
    const p = vmPaths("/r");
    const cmd = codexEngine.command({ prompt: "hi", sessionId: "t1", model: null, paths: p });
    expect(cmd.args.slice(0, 3)).toEqual(["exec", "resume", "t1"]);
    const cred = codexEngine.credentials({ kind: "auth_json", secret: '{"tokens":{}}' }, p);
    expect(cred.files).toEqual([{ path: "/r/.codex/auth.json", content: '{"tokens":{}}', mode: 0o600 }]);
  });

  it("surfaces turn failures", () => {
    const [ev] = createCodexParser().push('{"type":"turn.failed","error":{"message":"You have hit your usage limit"}}');
    expect(ev).toEqual({ type: "error", message: "You have hit your usage limit" });
  });
});
