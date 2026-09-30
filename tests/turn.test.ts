import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ExecOptions, VmHandle, VmProvider } from "@/lib/vm/types";

const dir = mkdtempSync(path.join(tmpdir(), "gr8r-test-"));
process.env.DATABASE_URL = `file:${dir}/test.db`;

const claudeLines = readFileSync(path.join(__dirname, "fixtures", "claude-stream.jsonl"), "utf8");

// A fake VM: records every command and file, replays the recorded Claude stream.
const calls: ExecOptions[] = [];
const files = new Map<string, string>();
let failResumeOnce = false;

const fakeVm: VmHandle = {
  name: "fake",
  root: "/vm",
  async exec(opts) {
    calls.push(opts);
    const isClaude = opts.cmd.endsWith("/claude");
    let out = "";
    let err = "";
    let code = 0;
    if (isClaude && failResumeOnce && opts.args?.includes("--resume")) {
      failResumeOnce = false;
      err = "No conversation found with session ID: stale\n";
      code = 1;
    } else if (isClaude) {
      out = claudeLines;
    }
    // Deliver stdout in awkward chunks to exercise line buffering.
    const chunks = out.match(/[\s\S]{1,37}/g) ?? [];
    return {
      async *logs() {
        for (const c of chunks) yield { stream: "stdout" as const, data: c };
        if (err) yield { stream: "stderr" as const, data: err };
      },
      wait: async () => ({ exitCode: code }),
    };
  },
  async spawnBackground() {},
  async writeFiles(fs) {
    for (const f of fs) files.set(f.path, f.content);
  },
  async readFile(p) {
    return files.get(p) ?? null;
  },
};

const fakeProvider: VmProvider = {
  id: "local",
  label: "fake",
  isolated: true,
  open: async () => fakeVm,
  stop: async () => {},
  destroy: async () => {},
};

let mod: typeof import("@/lib/runtime/turn");
let db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>;
let schema: typeof import("@/lib/db").schema;

beforeAll(async () => {
  (await import("@/lib/vm")).setVmProviderOverride(fakeProvider);
  const dbm = await import("@/lib/db");
  db = await dbm.getDb();
  schema = dbm.schema;
  mod = await import("@/lib/runtime/turn");
  const { saveCredential } = await import("@/lib/runtime/connections");
  const now = new Date();
  await db.insert(schema.users).values({ id: "u1", email: "a@b.co", passwordHash: "x", createdAt: now });
  await db.insert(schema.agents).values({
    id: "a1", userId: "u1", name: "Atlas", engine: "claude", vmProvider: "local", vmName: "gr8r-agent-a1",
    persona: "Be brief.", createdAt: now,
  });
  await saveCredential("u1", "claude", "oauth_token", "sk-ant-oat01-test");
});

async function agent() {
  const { eq } = await import("drizzle-orm");
  const [a] = await db.select().from(schema.agents).where(eq(schema.agents.id, "a1"));
  return a;
}

async function collect(text: string) {
  const events = [];
  for await (const ev of mod.runTurn({ agent: await agent(), text, channel: "web" })) events.push(ev);
  return events;
}

describe("runTurn", () => {
  it("boots the VM, injects credentials, streams and persists the turn", async () => {
    const events = await collect("hello");
    expect(events.at(-1)).toMatchObject({ type: "done", costUsd: 0.003236 });

    // bootstrap ran, persona written for both engines
    expect(calls[0].cmd).toBe("bash");
    expect(files.get("/vm/workspace/CLAUDE.md")).toContain("Be brief.");
    expect(files.get("/vm/workspace/AGENTS.md")).toContain("# Atlas");

    const run = calls.find((c) => c.cmd.endsWith("/claude"))!;
    expect(run.env).toMatchObject({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test", CLAUDE_CONFIG_DIR: "/vm/.claude" });
    expect(run.cwd).toBe("/vm/workspace");
    expect(run.args).not.toContain("--resume");

    const a = await agent();
    expect(a.vmStatus).toBe("ready");
    expect(a.engineSessionId).toBe("40f31631-21e4-45c6-96c8-a27b6c2c5e42");
    expect(a.busyUntil).toBeNull();

    const msgs = await db.select().from(schema.messages);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    const reply = msgs.find((m) => m.role === "assistant")!;
    expect(reply.content).toBe("Let me check.\n\nHi! What are you working on today?");
    expect(JSON.parse(reply.parts!)).toHaveLength(3);
  });

  it("resumes the session and skips bootstrap once ready", async () => {
    calls.length = 0;
    await collect("again");
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(expect.arrayContaining(["--resume", "40f31631-21e4-45c6-96c8-a27b6c2c5e42"]));
  });

  it("starts a fresh session when the VM lost the old one", async () => {
    calls.length = 0;
    failResumeOnce = true;
    const events = await collect("after reset");
    expect(events.some((e) => e.type === "status" && /fresh/.test(e.message))).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].args).not.toContain("--resume");
    expect(events.at(-1)?.type).toBe("done");
  });

  it("refuses concurrent turns", async () => {
    const { eq } = await import("drizzle-orm");
    await db.update(schema.agents).set({ busyUntil: new Date(Date.now() + 60_000) }).where(eq(schema.agents.id, "a1"));
    await expect(collect("parallel")).rejects.toBeInstanceOf(mod.AgentBusyError);
    await db.update(schema.agents).set({ busyUntil: null }).where(eq(schema.agents.id, "a1"));
  });

  it("explains a missing connection instead of crashing", async () => {
    const { deleteCredential } = await import("@/lib/runtime/connections");
    await deleteCredential("u1", "claude");
    const events = await collect("no creds");
    expect(events.at(-1)).toEqual({ type: "error", message: expect.stringContaining("Connect your Claude account") });
    expect((await agent()).busyUntil).toBeNull();
  });
});
