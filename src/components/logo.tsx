import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-black text-accent-ink">
        G8
      </span>
      <span>
        Gr8r <span className="hidden font-normal text-muted sm:inline">Agents</span>
      </span>
    </Link>
  );
}
