import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "gr8r_session";

function secretKey() {
  return new Uint8Array(createHash("sha256").update(`${env.appSecret}:jwt`).digest());
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
