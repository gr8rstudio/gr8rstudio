"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/app" ? path === "/app" || path.startsWith("/app/agents") : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1.5 transition ${active ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
    >
      {children}
    </Link>
  );
}
