import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { open, seal } from "@/lib/vault";
import { parseDeviceAuth } from "@/lib/runtime/chatgpt-login";

describe("vault", () => {
  it("round-trips and rejects the wrong key", () => {
    const sealed = seal("sk-ant-oat01-secret", "k".repeat(32));
    expect(sealed).not.toContain("secret");
    expect(open(sealed, "k".repeat(32))).toBe("sk-ant-oat01-secret");
    expect(() => open(sealed, "x".repeat(32))).toThrow();
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("codex device auth output", () => {
  it("extracts the verification url and one-time code", () => {
    const log = [
      "\u001b[1mFollow these steps to sign in with ChatGPT using device code authorization:\u001b[0m",
      "",
      "1. Open this link in your browser and sign in to your account",
      "   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m",
      "",
      "2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m",
      "   \u001b[94mQ7RM-4KXPD\u001b[0m",
    ].join("\n");
    expect(parseDeviceAuth(log)).toEqual({ url: "https://auth.openai.com/codex/device", code: "Q7RM-4KXPD" });
  });

  it("returns nulls before the code is printed", () => {
    expect(parseDeviceAuth("Requesting a one-time code...")).toEqual({ url: null, code: null });
  });
});
