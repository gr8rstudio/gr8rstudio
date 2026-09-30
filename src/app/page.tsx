import Link from "next/link";
import { Bot, Cpu, KeyRound, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/session";

const features = [
  {
    icon: KeyRound,
    title: "Bring your subscriptions",
    body: "Sign in with ChatGPT and connect your Claude plan. Your agents run on what you already pay for. No new API bill.",
  },
  {
    icon: Cpu,
    title: "Every agent gets its own VM",
    body: "Each agent lives in a private microVM with a persistent disk, shell, internet and its own memory. It sleeps when idle and wakes on your next message.",
  },
  {
    icon: Bot,
    title: "Real agents, not chatbots",
    body: "Under the hood run the official Claude Code and Codex agents, so they can write code, run it, browse and build files.",
  },
  {
    icon: MessageCircle,
    title: "Chat anywhere",
    body: "Talk to your agents on the web or give each one its own Telegram bot, privately paired to you.",
  },
  {
    icon: ShieldCheck,
    title: "Keys stay yours",
    body: "Credentials are encrypted at rest and only ever written into your own agents' VMs.",
  },
  {
    icon: Sparkles,
    title: "Personas & memory",
    body: "Give each agent a personality and a job. They keep notes in their own memory folder across conversations.",
  },
];

export default async function Home() {
  const user = await currentUser();
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/app" className="btn btn-primary">Open app</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-24">
        <div className="badge mb-6">
          <span className="size-1.5 rounded-full bg-accent" /> ChatGPT sign-in · Claude subscriptions · 1 VM per agent
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Your own AI agents.
          <br />
          <span className="text-accent">Each with its own computer.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted text-pretty">
          Spin up personal agents powered by the ChatGPT and Claude plans you already have. Every agent
          gets a private VM, so it can actually do things: code, research, automate, remember.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={user ? "/app" : "/signup"} className="btn btn-primary px-5 py-2.5 text-base">
            {user ? "Go to your agents" : "Create your first agent"}
          </Link>
          <a href="#how" className="btn px-5 py-2.5 text-base">How it works</a>
        </div>
      </section>

      <section id="how" className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <f.icon className="size-5 text-accent" />
            <h3 className="mt-4 font-medium">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        Built by Gr8r Studio · gr8rstudio.com
      </footer>
    </main>
  );
}
