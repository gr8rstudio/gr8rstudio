import "server-only";
import { env } from "../env";
import { localProvider } from "./local";
import { vercelProvider } from "./vercel";
import type { VmProvider } from "./types";

const providers: Record<string, VmProvider> = { local: localProvider, vercel: vercelProvider };

let override: VmProvider | null = null;

/** Test hook. */
export function setVmProviderOverride(p: VmProvider | null) {
  override = p;
}

export function getVmProvider(id?: string): VmProvider {
  if (override) return override;
  const p = providers[id ?? env.vmProvider];
  if (!p) throw new Error(`Unknown VM provider: ${id}`);
  return p;
}

export function defaultVmProviderId() {
  return env.vmProvider;
}

export * from "./types";
