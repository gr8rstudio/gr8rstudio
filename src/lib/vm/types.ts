export interface ExecOptions {
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  signal?: AbortSignal;
}

export interface LogChunk {
  stream: "stdout" | "stderr";
  data: string;
}

export interface ExecProcess {
  logs(): AsyncIterable<LogChunk>;
  wait(): Promise<{ exitCode: number }>;
}

/** A running (or resumable) VM that belongs to exactly one agent or login flow. */
export interface VmHandle {
  readonly name: string;
  /** Absolute directory that holds tools/, .claude/, .codex/ and workspace/. */
  readonly root: string;
  exec(opts: ExecOptions): Promise<ExecProcess>;
  /** Start a shell script in the background and return immediately. */
  spawnBackground(script: string, env?: Record<string, string>): Promise<void>;
  writeFiles(files: { path: string; content: string; mode?: number }[]): Promise<void>;
  readFile(path: string): Promise<string | null>;
}

export interface VmProvider {
  readonly id: "vercel" | "local";
  readonly label: string;
  /** Whether each VM is actually isolated from the host and other VMs. */
  readonly isolated: boolean;
  open(name: string, opts?: { persistent?: boolean; timeoutMs?: number }): Promise<VmHandle>;
  stop(name: string): Promise<void>;
  destroy(name: string): Promise<void>;
}

export async function run(
  vm: VmHandle,
  opts: ExecOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = await vm.exec(opts);
  let stdout = "";
  let stderr = "";
  for await (const c of proc.logs()) {
    if (c.stream === "stdout") stdout += c.data;
    else stderr += c.data;
  }
  const { exitCode } = await proc.wait();
  return { exitCode, stdout, stderr };
}

export function sh(script: string): ExecOptions {
  return { cmd: "bash", args: ["-lc", script] };
}

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
