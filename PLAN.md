# Gr8r Agents: plan

> "Build my own Bot / Dot. It should use ChatGPT sign-in and Claude subscriptions. Every agent gets its own VM."

Gr8r Agents is a personal-agent platform. A user signs up, connects the AI subscriptions they
already pay for (ChatGPT Plus/Pro via **Sign in with ChatGPT**, Claude Pro/Max via a **Claude
subscription token**) and creates agents. **Each agent lives in its own isolated microVM** with a
persistent disk, its own workspace, memory files and tools. You talk to an agent in the web app
or through its own Telegram bot.

## 1. Core idea: we don't proxy the models, we host the official agents

We don't call OpenAI or Anthropic ourselves with the user's subscription. Each agent's VM runs
the vendors' own agent CLIs:

| Engine | CLI inside the VM | Subscription auth | API-key fallback |
| --- | --- | --- | --- |
| Claude | `claude` (Claude Code) | `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` | `ANTHROPIC_API_KEY` |
| ChatGPT | `codex` (OpenAI Codex CLI) | `~/.codex/auth.json` from `codex login --device-auth` (Sign in with ChatGPT) | `OPENAI_API_KEY` |

Why this design:
- **The subscription is actually used.** Rate limits and billing come from the user's own
  plan, through the vendor's own client.
- **A real agent loop.** The agent gets shell, files, web and code execution for free, safely
  inside a VM that only that agent can touch.
- **Credentials stay scoped.** They're encrypted at rest (AES-256-GCM) and only get written into
  the VM of the user who owns them, when an agent runs.

> ⚠️ **Policy check before a commercial launch.** Anthropic and OpenAI both limit how
> subscription logins may be used by third-party products. Anthropic, for example, does not
> allow third-party developers to offer claude.ai login for their products without prior
> approval. Before selling this, confirm the current terms with both vendors or get approval.
> Until then, keep API keys (always allowed) as the default option. The code supports both
> auth modes for each engine.

## 2. Architecture

```
Browser ──► Next.js app (Vercel)
             ├─ Auth (email + password, signed JWT cookie)
             ├─ DB (Drizzle + libSQL: local file in dev, Turso in prod)
             ├─ Vault (AES-256-GCM, key from APP_SECRET)
             ├─ Agent runtime
             │    ├─ VM provider interface
             │    │    ├─ vercel  → @vercel/sandbox persistent named microVM per agent
             │    │    └─ local   → folder + child process (dev only, NOT isolated)
             │    ├─ Engines: claude (stream-json) · codex (exec --json)
             │    └─ Turn runner → normalised event stream → SSE to UI + persisted
             └─ Channels: Web chat (SSE) · Telegram webhook per agent
```

### Per-agent VM layout (identical on every provider)
```
<root>/
  tools/        # npm prefix: claude + codex CLIs (installed once on VM creation)
  .claude/      # CLAUDE_CONFIG_DIR, Claude session history (resume works across turns)
  .codex/       # CODEX_HOME: auth.json + sessions
  workspace/    # the agent's cwd: CLAUDE.md / AGENTS.md persona, memory/, whatever it builds
```
Vercel Sandbox `persistent: true` snapshots the filesystem when the VM sleeps and restores it on
the next turn. Each agent is a real VM that costs nothing while idle.

### Data model
- `users`: id, email, password_hash
- `connections`: user_id, provider (`claude` | `chatgpt`), kind (`oauth_token` | `auth_json` | `api_key`), secret (encrypted)
- `agents`: user_id, name, emoji, persona, engine, model, vm_provider, vm_name, vm_status, engine_session_id, busy_until, telegram fields
- `messages`: agent_id, role, content, events (JSON tool trace), channel, created_at
- `login_flows`: in-progress ChatGPT device logins (VM name, command id, code, URL, status)

### Key flows
1. **Connect ChatGPT (Sign in with ChatGPT).** Boot a short-lived login VM, run
   `codex login --device-auth`, stream its output until we find the URL and one-time code, and
   show them. The user approves on openai.com. We poll until the command exits, read
   `auth.json`, encrypt it, store it, and destroy the login VM. Fallback: paste `auth.json`, or
   an API key.
2. **Connect Claude.** The user runs `claude setup-token` locally (one browser click) and pastes
   the token (`sk-ant-oat01-…`), or an API key.
3. **Create agent.** Pick the engine, name and persona. The VM is created lazily on first
   message (or with "Boot VM"): install the CLIs, write the persona file, create `memory/`.
4. **Run a turn.** Lock the agent, ensure the VM, write fresh credentials, run the engine CLI
   detached, stream logs, parse JSONL into normalised events (`text`, `tool`, `tool_result`,
   `done`, `error`), stream them over SSE, save the transcript and the engine session id
   (next turn resumes it), and write back the refreshed `auth.json`.
5. **Telegram.** Paste a BotFather token. We call `setWebhook` with a secret. Incoming messages
   run the same turn runner in `after()` and the reply goes back via `sendMessage`.

## 3. Milestones

- **M1 · Foundation**: Next.js + Tailwind scaffold, DB schema, auth, vault. *(this PR)*
- **M2 · VMs**: provider interface, Vercel Sandbox provider, local dev provider, bootstrap. *(this PR)*
- **M3 · Engines**: Claude + Codex adapters, stream parsers with tests, turn runner, SSE chat. *(this PR)*
- **M4 · Connections**: ChatGPT device login in a VM, auth.json paste, Claude token, API keys. *(this PR)*
- **M5 · Product UI**: dashboard, agent chat with live tool trace, VM controls (boot / sleep / reset), files view, settings. *(this PR)*
- **M6 · Telegram channel**: per-agent bot. *(this PR)*
- **Next**
  - Scheduled heartbeats (cron → agent turn, "Dot"-style proactive check-ins)
  - Agent-to-agent handoff, shared drives (`@vercel/sandbox` Drive mounts)
  - Per-agent network policy UI (allow-list domains), usage metering and billing
  - Docker / Fly Machines providers for self-hosting
  - WhatsApp / Slack / iMessage channels

## 4. Environment

| Var | Purpose |
| --- | --- |
| `APP_SECRET` | 32+ char secret: JWT signing and vault key derivation |
| `DATABASE_URL` | `file:.data/gr8r.db` (dev) or `libsql://…` (Turso) |
| `DATABASE_AUTH_TOKEN` | Turso token (prod) |
| `VM_PROVIDER` | `vercel` (prod) or `local` (dev) |
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` | Sandbox credentials outside Vercel (OIDC is automatic on Vercel) |
| `APP_URL` | Public URL for Telegram webhooks |
