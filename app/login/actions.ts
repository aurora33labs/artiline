"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";
import { sanitizeCallbackUrl } from "@/lib/safe-redirect";
import {
  type Bucket,
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailure,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

async function loginBuckets(email: string): Promise<Bucket[]> {
  const ip = await getClientIp();
  const buckets: Bucket[] = [
    { key: email, kind: "login-email", limit: 5, windowMin: 15 },
  ];
  if (ip) buckets.push({ key: ip, kind: "login-ip", limit: 20, windowMin: 15 });
  return buckets;
}

/**
 * Email + password sign-in. Self-host fallback for instances without Resend, so
 * members invited via link (who set a password) can log back in. Uses the same
 * manual database session as SSO — no Credentials provider, no JWT strategy.
 */
export async function signInWithPassword(formData: FormData) {
  // Preserve the post-login destination (e.g. the OAuth authorize page) across
  // both failures and success. Sanitized to a same-origin relative path.
  const callbackUrl = sanitizeCallbackUrl(
    formData.get("callbackUrl") as string | null,
  );
  const cbParam =
    callbackUrl === "/" ? "" : `&callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect(`/login?error=badcreds${cbParam}`);
  const email = parsed.data.email.toLowerCase();
  const buckets = await loginBuckets(email);

  // Throttle brute force. Cooldown is temporary; magic link stays an open
  // recovery path, so this can't permanently lock anyone out.
  if ((await isRateLimited(buckets)).limited)
    redirect(`/login?error=throttled${cbParam}`);

  const [user] = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Same generic outcome whether the email is unknown or the password is wrong,
  // so the form can't be used to probe which emails have accounts.
  if (!user?.passwordHash) {
    await recordFailure(buckets);
    redirect(`/login?error=badcreds${cbParam}`);
  }
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    await recordFailure(buckets);
    redirect(`/login?error=badcreds${cbParam}`);
  }

  await clearAttempts(buckets);
  const { sessionToken, expires } = await createUserSession(user.id);
  await setSessionCookie(sessionToken, expires);
  redirect(callbackUrl);
}
