import "server-only";

const DEV_SECRET = "gr8r-dev-secret-change-me-please-0000000000";

export const env = {
  get appSecret(): string {
    const s = process.env.APP_SECRET;
    if (s && s.length >= 32) return s;
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_SECRET must be set (32+ chars) in production");
    }
    return DEV_SECRET;
  },
  databaseUrl: process.env.DATABASE_URL ?? "file:.data/gr8r.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  vmProvider: (process.env.VM_PROVIDER ?? (process.env.VERCEL ? "vercel" : "local")) as
    | "vercel"
    | "local",
  appUrl: process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000"),
};
