// Shared between server and browser: the normalised event stream an agent turn produces,
// and the reducer that folds events into the stored/displayed message parts.

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "session"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; input: string }
  | { type: "tool_result"; id: string; output: string; isError?: boolean }
  | { type: "done"; costUsd?: number; usage?: Record<string, number> }
  | { type: "error"; message: string };

export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; input: string; output?: string; isError?: boolean };

export function applyEvent(parts: MessagePart[], ev: AgentEvent): MessagePart[] {
  switch (ev.type) {
    case "text": {
      const last = parts[parts.length - 1];
      if (last?.kind === "text") {
        return [...parts.slice(0, -1), { kind: "text", text: last.text + ev.delta }];
      }
      return [...parts, { kind: "text", text: ev.delta.replace(/^\n+/, "") }];
    }
    case "tool":
      if (parts.some((p) => p.kind === "tool" && p.id === ev.id)) return parts;
      return [...parts, { kind: "tool", id: ev.id, name: ev.name, input: ev.input }];
    case "tool_result":
      return parts.map((p) =>
        p.kind === "tool" && p.id === ev.id ? { ...p, output: ev.output, isError: ev.isError } : p,
      );
    default:
      return parts;
  }
}

export function partsToText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function truncate(s: string, max = 4000): string {
  return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more chars)` : s;
}
