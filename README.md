# Gr8r Agents

Personal AI agents that run on the **ChatGPT and Claude subscriptions you already pay for**. **Every agent gets its own VM.**

- **Sign in with ChatGPT.** We run the official `codex login --device-auth` in a throwaway VM and show you the one-time code. Your `auth.json` is encrypted into the vault.
- **Claude subscription.** Paste a `claude setup-token` token (or an API key).
- **One microVM per agent** (Vercel Sandbox, `persistent: true`). Each VM has a persistent disk, shell, internet, the official **Claude Code** / **Codex** agents, a persona file and a `memory/` folder. It sleeps when idle and resumes on the next message.
- **Chat** on the web with live streaming and a tool trace, or through a **per-agent Telegram bot** paired privately to you.

See [PLAN.md](./PLAN.md) for the architecture, data model and roadmap.

## Quick start (dev)

```bash
cp .env.example .env.local   # set APP_SECRET; VM_PROVIDER=local for dev
npm install
npm run dev                  # http://localhost:3000
```

Sign up, then go to **Connections** and connect Claude and/or ChatGPT. Create an agent and send it a message. The first message boots its VM and installs the CLIs, which takes about a minute, once.

`VM_PROVIDER=local` runs "VMs" as folders under `.data/vms`, with **no isolation**. Use it only for development.

## Deploy (Vercel)

1. Import the repo into Vercel. Sandbox auth uses OIDC automatically.
2. Create a Turso database. Set `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and `APP_SECRET`. `VM_PROVIDER` defaults to `vercel` on Vercel.
3. Tables are created automatically on first request.

## How a turn works

```
POST /api/agents/:id/chat (SSE)
  → lock agent → ensure VM (bootstrap CLIs once) → write persona + credentials
  → claude -p --output-format stream-json …  |  codex exec --json …   (inside the agent's VM)
  → parse JSONL → normalised events (text / tool / tool_result / done / error) → browser
  → persist transcript + engine session id (next turn resumes) + rotated ChatGPT tokens
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm test` | parser, vault, auth and turn-runner tests (vitest) |
| `npm run typecheck` / `npm run lint` | static checks |
| `npm run build` | production build |

## Code map

```
src/lib/vm/            VM provider interface · vercel.ts (microVMs) · local.ts (dev)
src/lib/engines/       claude.ts / codex.ts: command, env, credentials, stream parser
src/lib/runtime/       turn.ts (turn runner) · bootstrap.ts · chatgpt-login.ts · connections.ts
src/lib/vault.ts       AES-256-GCM credential sealing
src/app/api/           chat SSE · files · ChatGPT login · Telegram webhook
src/app/app/           dashboard · connections · agent workspace
```

## ⚠️ Subscription terms

Anthropic and OpenAI both restrict how consumer-subscription logins may be used by third-party products. Anthropic, for example, requires prior approval before a third-party product offers claude.ai login. This app keeps each user's own credentials inside that user's own VMs, running the vendors' official CLIs. **Confirm the current terms (or get approval) before offering this commercially.** API keys are always supported as a fallback.
