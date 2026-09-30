"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { hashPassword, verifyPassword } from "@/lib/password";
import { endSession, startSession } from "@/lib/session";

export type FormState = { error?: string } | undefined;

const Creds = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().max(80).optional(),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Creds.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const { email, password, name } = parsed.data;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return { error: "An account with that email already exists" };
  const id = newId();
  await db.insert(schema.users).values({
    id,
    email,
    name: name || null,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  });
  await startSession(id);
  redirect("/app/connections?welcome=1");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Creds.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid email or password" };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  await startSession(user.id);
  redirect("/app");
}

export async function logout() {
  await endSession();
  redirect("/");
}
