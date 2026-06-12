"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";
import { isFirstRun } from "@/lib/bootstrap";
import { currentEdition } from "@/lib/license";

const signupSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

/**
 * Email + password registration. Creates the account and signs in immediately,
 * so a fresh instance works with no email provider. The owner then names their
 * workspace on /signup/workspace. Magic link stays available as a Resend bonus.
 */
export async function signUpWithPassword(formData: FormData) {
  // OSS self-host: open signup is allowed only on a fresh instance (first-run
  // owner). Once that owner exists, everyone else joins by invite — keeps the
  // instance to a single founding owner and prevents orphan accounts. Cloud
  // (SaaS) keeps signup open.
  if (currentEdition() === "oss" && !(await isFirstRun()))
    redirect("/login?error=closed");

  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/signup?error=invalid");
  const email = parsed.data.email.toLowerCase();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  // Never overwrite an existing account from signup — send them to sign in.
  if (existing) redirect("/login?error=exists");

  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      emailVerified: new Date(),
    })
    .returning({ id: schema.users.id });

  const { sessionToken, expires } = await createUserSession(user.id);
  await setSessionCookie(sessionToken, expires);
  redirect("/signup/workspace");
}
