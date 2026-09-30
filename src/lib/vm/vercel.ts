import { Sandbox } from "@vercel/sandbox";
import type { ExecOptions, ExecProcess, VmHandle, VmProvider } from "./types";

/**
 * Production provider: each agent is a persistent, named Vercel Sandbox (Firecracker microVM).
 * With `persistent: true` the filesystem is snapshotted when the VM stops and restored on the
 * next command, so an idle agent costs nothing and still keeps its disk.
 */

// On Vercel the SDK authenticates with OIDC automatically. Elsewhere, use an access token.
function credentials() {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
  return VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID
    ? { token: VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, projectId: VERCEL_PROJECT_ID }
    : {};
}

const IMAGE = process.env.VM_IMAGE; // default: vercel/sandbox/universal
const VCPUS = Number(process.env.VM_VCPUS ?? 2);

class VercelVm implements VmHandle {
  constructor(private sandbox: Sandbox) {}

  get name() {
    return this.sandbox.name;
  }

  get root() {
    return this.sandbox.cwd;
  }

  async exec(opts: ExecOptions): Promise<ExecProcess> {
    const cmd = await this.sandbox.runCommand({
      cmd: opts.cmd,
      args: opts.args,
      env: opts.env,
      cwd: opts.cwd ?? this.root,
      signal: opts.signal,
      detached: true,
    });
    return {
      async *logs() {
        for await (const line of cmd.logs({ signal: opts.signal })) {
          yield { stream: line.stream, data: line.data };
        }
      },
      async wait() {
        const done = await cmd.wait({ signal: opts.signal });
        return { exitCode: done.exitCode ?? 1 };
      },
      async kill() {
        await cmd.kill("SIGTERM").catch(() => {});
      },
    };
  }

  async spawnBackground(script: string, env?: Record<string, string>) {
    await this.sandbox.runCommand({ cmd: "bash", args: ["-lc", script], env, detached: true });
  }

  async writeFiles(files: { path: string; content: string; mode?: number }[]) {
    await this.sandbox.writeFiles(
      files.map((f) => ({ path: f.path, content: f.content, mode: f.mode })),
    );
  }

  async readFile(path: string) {
    const buf = await this.sandbox.readFileToBuffer({ path });
    return buf ? buf.toString("utf8") : null;
  }
}

async function find(name: string): Promise<Sandbox | null> {
  try {
    return await Sandbox.get({ name, ...credentials() });
  } catch {
    return null;
  }
}

export const vercelProvider: VmProvider = {
  id: "vercel",
  label: "Vercel Sandbox microVM",
  isolated: true,
  async open(name, opts) {
    const sandbox = await Sandbox.getOrCreate({
      name,
      persistent: opts?.persistent ?? true,
      timeout: opts?.timeoutMs ?? 30 * 60 * 1000,
      resources: { vcpus: VCPUS },
      keepLastSnapshots: { count: 2, expiration: 0 },
      tags: { app: "gr8r" },
      ...(IMAGE ? { image: IMAGE } : {}),
      ...credentials(),
    });
    return new VercelVm(sandbox);
  },
  async stop(name) {
    const sb = await find(name);
    if (sb && sb.status === "running") await sb.stop();
  },
  async destroy(name) {
    const sb = await find(name);
    if (sb) await sb.delete({ deleteOrphanSnapshots: true });
  },
};
