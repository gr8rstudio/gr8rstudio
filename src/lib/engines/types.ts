import type { AgentEvent } from "../events";
import type { ConnectionKind, EngineId, Provider } from "../db/schema";

export interface VmPaths {
  root: string;
  tools: string;
  workspace: string;
  claudeDir: string;
  codexDir: string;
  bin(name: "claude" | "codex"): string;
}

export function vmPaths(root: string): VmPaths {
  return {
    root,
    tools: `${root}/tools`,
    workspace: `${root}/workspace`,
    claudeDir: `${root}/.claude`,
    codexDir: `${root}/.codex`,
    bin: (name) => `${root}/tools/node_modules/.bin/${name}`,
  };
}

export interface StreamParser {
  push(line: string): AgentEvent[];
}

export interface Credential {
  kind: ConnectionKind;
  secret: string;
}

export interface PreparedCredential {
  env: Record<string, string>;
  files: { path: string; content: string; mode?: number }[];
}

export interface Engine {
  id: EngineId;
  label: string;
  provider: Provider;
  /** File in the workspace the CLI reads as project instructions. */
  personaFile: string;
  command(input: {
    prompt: string;
    sessionId: string | null;
    model: string | null;
    paths: VmPaths;
  }): { cmd: string; args: string[] };
  env(paths: VmPaths): Record<string, string>;
  credentials(cred: Credential, paths: VmPaths): PreparedCredential;
  createParser(): StreamParser;
}

export function parseJsonLine(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
