import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Agent } from "../db/schema";
import { getEngine, vmPaths } from "../engines";
import { applyEvent, partsToText, type AgentEvent, type MessagePart } from "../events";
import { newId } from "../ids";
import { getVmProvider } from "../vm";
import { bootstrapVm, writePersona } from "./bootstrap";
import { getCredential, updateCredentialSecret } from "./connections";

const LOCK_MS = 15 * 60 * 1000;
const STALE_SESSION = /no conversation found|session .*not found|thread .*not found|no rollout found/i;

export class AgentBusyError extends Error {
  constructor() {
    super("This agent is already working on something. Try again in a moment.");
  }
}

async function acquireLock(agentId: string): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .update(schema.agents)
    .set({ busyUntil: new Date(now.getTime() + LOCK_MS) })
    .where(
      and(
        eq(schema.agents.id, agentId),
        or(isNull(schema.agents.busyUntil), lt(schema.agents.busyUntil, now)),
      ),
    )
    .returning({ id: schema.agents.id });
  return rows.length > 0;
}

/** Split a byte stream into complete lines. */
function lineSplitter() {
  let buf = "";
  return {
    push(chunk: string): string[] {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      const rest = buf;
      buf = "";
      return rest ? [rest] : [];
    },
  };
}

export interface TurnInput {
  agent: Agent;
  text: string;
  channel: "web" | "telegram";
}

/**
 * Run one conversational turn of an agent inside its VM, yielding normalised events.
 * Persists the user message, the assistant reply (with tool trace) and the engine session id.
 * Always drains to completion; callers may stop reading without leaving the agent locked.
 */
export async function* runTurn({ agent: initial, text, channel }: TurnInput): AsyncGenerator<AgentEvent> {
  const db = await getDb();
  if (!(await acquireLock(initial.id))) throw new AgentBusyError();

  // Re-read after locking so we act on the freshest state.
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, initial.id));
  const engine = getEngine(agent.engine);
  let parts: MessagePart[] = [];
  let error: string | null = null;
  let done: Extract<AgentEvent, { type: "done" }> | null = null;
  let sessionId = agent.engineSessionId;
  let vmStatus = agent.vmStatus;
  let personaDirty = agent.personaDirty;

  await db.insert(schema.messages).values({
    id: newId(),
    agentId: agent.id,
    role: "user",
    content: text,
    channel,
    createdAt: new Date(),
  });

  const setVm = async (status: Agent["vmStatus"], vmError: string | null = null) => {
    vmStatus = status;
    await db.update(schema.agents).set({ vmStatus: status, vmError }).where(eq(schema.agents.id, agent.id));
  };

  try {
    const cred = await getCredential(agent.userId, engine.provider);
    if (!cred) {
      const name = engine.provider === "claude" ? "Claude" : "ChatGPT";
      throw new Error(`Connect your ${name} account first (Connections page), then try again.`);
    }

    yield { type: "status", message: vmStatus === "ready" ? "Waking VM…" : "Booting VM…" };
    const provider = getVmProvider(agent.vmProvider);
    const vm = await provider.open(agent.vmName);
    const paths = vmPaths(vm.root);

    if (vmStatus !== "ready") {
      await setVm("booting");
      yield { type: "status", message: "Installing agent tools in the VM (first boot takes about a minute)…" };
      try {
        await bootstrapVm(vm);
      } catch (e) {
        await setVm("error", (e as Error).message);
        throw e;
      }
      await setVm("ready");
      personaDirty = true;
    }
    if (personaDirty) {
      await writePersona(vm, agent);
      personaDirty = false;
      await db.update(schema.agents).set({ personaDirty: false }).where(eq(schema.agents.id, agent.id));
    }

    const prepared = engine.credentials(cred, paths);
    if (prepared.files.length) await vm.writeFiles(prepared.files);

    for (let attempt = 0; attempt < 2; attempt++) {
      const { cmd, args } = engine.command({ prompt: text, sessionId, model: agent.model, paths });
      yield { type: "status", message: "Thinking…" };
      const proc = await vm.exec({
        cmd,
        args,
        env: { ...engine.env(paths), ...prepared.env },
        cwd: paths.workspace,
      });
      const parser = engine.createParser();
      const lines = lineSplitter();
      let stderr = "";
      let attemptError: string | null = null;

      const handle = function* (line: string): Generator<AgentEvent> {
        for (const ev of parser.push(line)) {
          if (ev.type === "session") sessionId = ev.id;
          else if (ev.type === "error") attemptError = ev.message;
          else if (ev.type === "done") done = ev;
          parts = applyEvent(parts, ev);
          if (ev.type !== "error") yield ev;
        }
      };

      for await (const chunk of proc.logs()) {
        if (chunk.stream === "stderr") {
          stderr = (stderr + chunk.data).slice(-4000);
          continue;
        }
        for (const line of lines.push(chunk.data)) yield* handle(line);
      }
      for (const line of lines.flush()) yield* handle(line);
      const { exitCode } = await proc.wait();

      if (!attemptError && !done && exitCode !== 0) {
        attemptError = stderr.trim().split("\n").slice(-8).join("\n") || `Agent exited with code ${exitCode}`;
        if (exitCode === 127) await setVm("none"); // CLI missing: reinstall next turn
      }

      // A reset VM loses the CLI's session store; start a fresh conversation once.
      const staleSession: boolean =
        attempt === 0 && sessionId !== null && parts.length === 0 &&
        attemptError !== null && STALE_SESSION.test(attemptError);
      if (staleSession) {
        sessionId = null;
        yield { type: "status", message: "Previous session not found in VM; starting a fresh one…" };
        continue;
      }
      if (attemptError) error = attemptError;
      break;
    }

    // Persist rotated ChatGPT tokens.
    if (cred.kind === "auth_json") {
      const fresh = await vm.readFile(`${paths.codexDir}/auth.json`);
      if (fresh && fresh.trim() !== cred.secret.trim()) {
        try {
          JSON.parse(fresh);
          await updateCredentialSecret(cred.id, fresh);
        } catch {
          /* ignore partial writes */
        }
      }
    }
  } catch (e) {
    error = (e as Error).message;
  } finally {
    const content = partsToText(parts) || (error ? "" : "(no reply)");
    const doneEv = done as Extract<AgentEvent, { type: "done" }> | null;
    await db.insert(schema.messages).values({
      id: newId(),
      agentId: agent.id,
      role: "assistant",
      content,
      parts: JSON.stringify(parts),
      channel,
      meta: JSON.stringify({ error, costUsd: doneEv?.costUsd, usage: doneEv?.usage }),
      createdAt: new Date(),
    });
    await db
      .update(schema.agents)
      .set({ busyUntil: null, lastActiveAt: new Date(), engineSessionId: sessionId })
      .where(eq(schema.agents.id, agent.id));
  }

  if (error) yield { type: "error", message: error };
  else yield done ?? { type: "done" };
}

/** Convenience for non-streaming channels (Telegram): run a turn and return the final text. */
export async function runTurnToText(input: TurnInput): Promise<{ text: string; error: string | null }> {
  let parts: MessagePart[] = [];
  let error: string | null = null;
  for await (const ev of runTurn(input)) {
    parts = applyEvent(parts, ev);
    if (ev.type === "error") error = ev.message;
  }
  return { text: partsToText(parts), error };
}
