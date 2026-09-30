import type { EngineId } from "../db/schema";
import { claudeEngine } from "./claude";
import { codexEngine } from "./codex";
import type { Engine } from "./types";

export const engines: Record<EngineId, Engine> = { claude: claudeEngine, codex: codexEngine };

export function getEngine(id: EngineId): Engine {
  const e = engines[id];
  if (!e) throw new Error(`Unknown engine: ${id}`);
  return e;
}

export * from "./types";
