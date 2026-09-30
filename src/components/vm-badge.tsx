import type { VmStatus } from "@/lib/db/schema";

const MAP: Record<VmStatus, { label: string; dot: string }> = {
  none: { label: "No VM yet", dot: "bg-[#55555f]" },
  booting: { label: "Booting", dot: "bg-warn animate-pulse" },
  ready: { label: "VM ready", dot: "bg-ok" },
  sleeping: { label: "Sleeping", dot: "bg-[#7c7cff]" },
  error: { label: "VM error", dot: "bg-danger" },
};

export function VmBadge({ status }: { status: VmStatus }) {
  const s = MAP[status] ?? MAP.none;
  return (
    <span className="badge">
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export const ENGINE_LABEL = { claude: "Claude", codex: "ChatGPT" } as const;
