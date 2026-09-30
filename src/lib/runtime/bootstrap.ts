import { run, sh, shellQuote, type VmHandle } from "../vm/types";
import { vmPaths, type VmPaths } from "../engines/types";
import type { Agent } from "../db/schema";

// Bump to force every VM to reinstall its tools on next boot.
export const TOOLS_VERSION = "1";

export const DEFAULT_PACKAGES = ["@anthropic-ai/claude-code@latest", "@openai/codex@latest"];

export async function bootstrapVm(
  vm: VmHandle,
  packages: string[] = DEFAULT_PACKAGES,
): Promise<VmPaths> {
  const p = vmPaths(vm.root);
  const marker = `${p.root}/.gr8r-ready`;
  const stamp = `${TOOLS_VERSION}:${packages.join(",")}`;
  const script = `
set -e
mkdir -p ${shellQuote(p.tools)} ${shellQuote(p.claudeDir)} ${shellQuote(p.codexDir)} ${shellQuote(p.workspace)}/memory
if [ "$(cat ${shellQuote(marker)} 2>/dev/null)" = ${shellQuote(stamp)} ]; then exit 0; fi
command -v node >/dev/null || { echo "node is not installed in this VM image" >&2; exit 3; }
cd ${shellQuote(p.tools)}
[ -f package.json ] || echo '{"private":true}' > package.json
npm install --no-audit --no-fund --loglevel=error ${packages.map(shellQuote).join(" ")}
printf %s ${shellQuote(stamp)} > ${shellQuote(marker)}
`;
  const res = await run(vm, sh(script));
  if (res.exitCode !== 0) {
    throw new Error(`VM bootstrap failed (exit ${res.exitCode}): ${(res.stderr || res.stdout).slice(-1500)}`);
  }
  return p;
}

export function personaDoc(agent: Pick<Agent, "name" | "persona">): string {
  return `# ${agent.name}

You are **${agent.name}**, a personal AI agent. You live in your own private Linux VM with a
persistent disk, full shell access and internet. This directory is your home workspace.

## How you work
- You talk to your owner through chat (the Gr8r web app or Telegram). Keep replies concise and
  conversational; use markdown sparingly (short lists, code blocks when useful).
- You can do real work: run commands, write and run code, browse the web, build files.
- Long-term memory lives in \`./memory/\`. Save durable facts, preferences and ongoing tasks to
  \`memory/notes.md\` (create it if missing) and check it when context would help.
- This file is managed by Gr8r and is overwritten when your owner edits your persona. Don't store
  memory here.

## Persona
${agent.persona.trim() || "Friendly, sharp and proactive. Get things done."}
`;
}

export async function writePersona(vm: VmHandle, agent: Pick<Agent, "name" | "persona">) {
  const p = vmPaths(vm.root);
  const doc = personaDoc(agent);
  await vm.writeFiles([
    { path: `${p.workspace}/CLAUDE.md`, content: doc },
    { path: `${p.workspace}/AGENTS.md`, content: doc },
  ]);
}
