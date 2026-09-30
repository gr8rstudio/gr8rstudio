import Link from "next/link";
import { Bot, Cpu, KeyRound, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/session";

const steps = [
  { n: "01", title: "Connect your AI", body: "Sign in with ChatGPT and paste a Claude token. It takes about two minutes." },
  { n: "02", title: "Create an agent", body: "Pick a brain, a name and a job. Start from a template or write your own persona." },
  { n: "03", title: "It gets a computer", body: "The first message boots its private VM. From then on, it remembers, builds and gets things done." },
];

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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-24 lg:grid-cols-[1.15fr_1fr]">
        <div>
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
        </div>
        <Preview />
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line p-6">
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
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

function Preview() {
  return (
    <div className="card relative overflow-hidden p-5 shadow-[0_30px_80px_-20px_rgba(198,244,50,0.15)]" aria-hidden>
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <div className="grid size-9 place-items-center rounded-xl bg-panel-2 text-lg">🧭</div>
        <div>
          <p className="text-sm font-medium">Chief of Staff</p>
          <p className="text-xs text-muted">Claude · private microVM</p>
        </div>
        <span className="badge ml-auto"><span className="size-1.5 rounded-full bg-ok" /> VM ready</span>
      </div>
      <div className="space-y-3 pt-4 text-sm">
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-panel-2 px-3.5 py-2">
          Plan my launch week and keep it in memory
        </div>
        <div className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-muted">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-ok" />
          <span className="text-text">Write</span> memory/launch-plan.md
        </div>
        <p className="text-muted">
          Done. I&apos;ve saved a 5-day plan to <span className="text-text">memory/launch-plan.md</span>. Monday: finalize
          landing copy. Want me to draft Monday&apos;s launch post?
        </p>
      </div>
    </div>
  );
}
