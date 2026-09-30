import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Provider = "claude" | "chatgpt";
export type ConnectionKind = "oauth_token" | "auth_json" | "api_key";

export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").$type<Provider>().notNull(),
    kind: text("kind").$type<ConnectionKind>().notNull(),
    secret: text("secret").notNull(), // sealed
    label: text("label"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("connections_user_idx").on(t.userId)],
);

export type EngineId = "claude" | "codex";
export type VmStatus = "none" | "booting" | "ready" | "sleeping" | "error";

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("🤖"),
    persona: text("persona").notNull().default(""),
    engine: text("engine").$type<EngineId>().notNull(),
    model: text("model"),
    vmProvider: text("vm_provider").notNull(),
    vmName: text("vm_name").notNull(),
    vmStatus: text("vm_status").$type<VmStatus>().notNull().default("none"),
    vmError: text("vm_error"),
    personaDirty: integer("persona_dirty", { mode: "boolean" }).notNull().default(true),
    engineSessionId: text("engine_session_id"),
    busyUntil: integer("busy_until", { mode: "timestamp_ms" }),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    telegramToken: text("telegram_token"), // sealed
    telegramSecret: text("telegram_secret"),
    telegramUsername: text("telegram_username"),
    telegramPairCode: text("telegram_pair_code"),
    telegramChatId: text("telegram_chat_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("agents_user_idx").on(t.userId)],
);

export type MessageRole = "user" | "assistant" | "system";

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull(),
    parts: text("parts"), // JSON: MessagePart[]
    channel: text("channel").notNull().default("web"),
    meta: text("meta"), // JSON: cost/usage/error
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("messages_agent_idx").on(t.agentId, t.createdAt)],
);

export const loginFlows = sqliteTable("login_flows", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").$type<Provider>().notNull(),
  vmName: text("vm_name").notNull(),
  status: text("status").$type<"starting" | "waiting" | "done" | "error">().notNull(),
  url: text("url"),
  code: text("code"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Message = typeof messages.$inferSelect;
