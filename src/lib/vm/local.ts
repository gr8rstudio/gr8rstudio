import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { ExecOptions, ExecProcess, LogChunk, VmHandle, VmProvider } from "./types";

/**
 * Development-only provider: every "VM" is a folder under .data/vms and commands run
 * as child processes of the Next.js server. Not isolated. Never use it in production.
 */
const BASE = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_VM_DIR ?? ".data/vms");

class LocalVm implements VmHandle {
  constructor(
    readonly name: string,
    readonly root: string,
  ) {}

  private baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    return { PATH: process.env.PATH, HOME: this.root, LANG: "C.UTF-8", TERM: "dumb", ...extra } as unknown as NodeJS.ProcessEnv;
  }

  async exec(opts: ExecOptions): Promise<ExecProcess> {
    const child = spawn(opts.cmd, opts.args ?? [], {
      cwd: opts.cwd ?? this.root,
      env: this.baseEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      signal: opts.signal,
    });
    const queue: (LogChunk | null)[] = [];
    let notify: (() => void) | null = null;
    let open = 2;
    const push = (c: LogChunk | null) => {
      queue.push(c);
      notify?.();
    };
    const done = () => {
      if (--open === 0) push(null);
    };
    child.stdout.setEncoding("utf8").on("data", (d: string) => push({ stream: "stdout", data: d }));
    child.stderr.setEncoding("utf8").on("data", (d: string) => push({ stream: "stderr", data: d }));
    child.stdout.on("end", done);
    child.stderr.on("end", done);
    const exit = new Promise<{ exitCode: number }>((resolve) => {
      child.on("error", (err) => {
        push({ stream: "stderr", data: `${err.message}\n` });
        resolve({ exitCode: 127 });
      });
      child.on("close", (code) => resolve({ exitCode: code ?? 1 }));
    });
    return {
      async *logs() {
        while (true) {
          if (queue.length === 0) await new Promise<void>((r) => (notify = r));
          notify = null;
          while (queue.length) {
            const c = queue.shift()!;
            if (c === null) return;
            yield c;
          }
        }
      },
      wait: () => exit,
    };
  }

  async spawnBackground(script: string, env?: Record<string, string>) {
    const child = spawn("bash", ["-lc", script], {
      cwd: this.root,
      env: this.baseEnv(env),
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  }

  private resolve(p: string) {
    const abs = path.resolve(/*turbopackIgnore: true*/ this.root, p);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) throw new Error(`Path escapes VM root: ${p}`);
    return abs;
  }

  async writeFiles(files: { path: string; content: string; mode?: number }[]) {
    for (const f of files) {
      const abs = this.resolve(f.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, f.content);
      if (f.mode) await chmod(abs, f.mode);
    }
  }

  async readFile(p: string) {
    try {
      return await readFile(this.resolve(p), "utf8");
    } catch {
      return null;
    }
  }
}

export const localProvider: VmProvider = {
  id: "local",
  label: "Local folder (dev only, not isolated)",
  isolated: false,
  async open(name) {
    const root = path.join(/*turbopackIgnore: true*/ BASE, name);
    await mkdir(root, { recursive: true });
    return new LocalVm(name, root);
  },
  async stop() {},
  async destroy(name) {
    await rm(path.join(/*turbopackIgnore: true*/ BASE, name), { recursive: true, force: true });
  },
};
