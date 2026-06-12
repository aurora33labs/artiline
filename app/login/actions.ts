"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

/**
 * Email + password sign-in. Self-host fallback for instances without Resend, so
 * members invited via link (who set a password) can log back in. Uses the same
 * manual database session as SSO — no Credentials provider, no JWT strategy.
 */
export async function signInWithPassword(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=badcreds");

  const [user] = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email.toLowerCase()))
    .limit(1);

  // Same generic outcome whether the email is unknown or the password is wrong,
  // so the form can't be used to probe which emails have accounts.
  if (!user?.passwordHash) redirect("/login?error=badcreds");
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) redirect("/login?error=badcreds");

  const { sessionToken, expires } = await createUserSession(user.id);
  await setSessionCookie(sessionToken, expires);
  redirect("/");
}
