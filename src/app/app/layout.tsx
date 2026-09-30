import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/app" />
          <nav className="ml-2 flex items-center gap-1 text-sm">
            <NavLink href="/app">Agents</NavLink>
            <NavLink href="/app/connections">Connections</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/app/agents/new" className="btn btn-primary hidden sm:inline-flex">New agent</Link>
            <form action={logout}>
              <button className="btn btn-ghost" title={user.email}>Log out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
