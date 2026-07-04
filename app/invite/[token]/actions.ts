"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";
import { recordEvent } from "@/lib/activity";
import {
  type Bucket,
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailure,
} from "@/lib/rate-limit";

// Cumulative wrong-password cap for an invite. Beyond this the invite is killed
// (expired) and must be reissued — closes the slow-drip brute force the sliding
// window alone would leave open across the invite's 7-day life.
const INVITE_KILL_AT = 10;

const acceptSchema = z.object({
  // nanoid(32) alphabet only — the token is interpolated into redirect paths, so
  // never let `/`, `?`, `#` or other path-control characters through.
  token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

/**
 * Accept an email-locked invite without email delivery. The link is the bearer
 * secret; the email stays fixed to the invite. New (or password-less) users set
 * their password here and get signed in. If a user with that email already has a
 * password, the field must match it — the link can never overwrite an existing
 * password, so a leaked link can't take over an account.
 */
export async function acceptInvite(formData: FormData) {
  const data = acceptSchema.parse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  const [invitation] = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      role: schema.invitations.role,
      acceptedAt: schema.invitations.acceptedAt,
      expiresAt: schema.invitations.expiresAt,
      failedAttempts: schema.invitations.failedAttempts,
      workspaceId: schema.workspaces.id,
      workspaceSlug: schema.workspaces.slug,
    })
    .from(schema.invitations)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.invitations.workspaceId),
    )
    .where(eq(schema.invitations.token, data.token))
    .limit(1);

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date())
    redirect(`/invite/${data.token}`);

  const [existing] = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, invitation.email))
    .limit(1);

  let userId: string;
  if (existing) {
    // The invite link alone is NOT proof of email ownership, so it must never
    // create or overwrite credentials on a pre-existing account — that would let
    // anyone holding the link take over an account that already exists (possibly
    // in another workspace). Passwordless accounts (magic link / SSO) have to
    // authenticate through their own method; once signed in the page auto-accepts.
    if (!existing.passwordHash) redirect(`/login?error=needsignin`);

    const ip = await getClientIp();
    const buckets: Bucket[] = [
      { key: data.token, kind: "invite-token", limit: 5, windowMin: 15 },
    ];
    if (ip) buckets.push({ key: ip, kind: "invite-ip", limit: 20, windowMin: 15 });
    if ((await isRateLimited(buckets)).limited)
      redirect(`/invite/${data.token}?error=throttled`);

    const ok = await bcrypt.compare(data.password, existing.passwordHash);
    if (!ok) {
      await recordFailure(buckets);
      // Cumulative kill: at the cap, expire the invite so it can't be guessed
      // for the rest of its window. Reissue is required.
      if (invitation.failedAttempts + 1 >= INVITE_KILL_AT) {
        await db
          .update(schema.invitations)
          .set({ failedAttempts: invitation.failedAttempts + 1, expiresAt: new Date() })
          .where(eq(schema.invitations.id, invitation.id));
      } else {
        await db
          .update(schema.invitations)
          .set({ failedAttempts: invitation.failedAttempts + 1 })
          .where(eq(schema.invitations.id, invitation.id));
      }
      redirect(`/invite/${data.token}?error=badpw`);
    }
    await clearAttempts(buckets);
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({
        email: invitation.email,
        name: data.name,
        passwordHash: await bcrypt.hash(data.password, 10),
        emailVerified: new Date(),
      })
      .returning({ id: schema.users.id });
    userId = created.id;
  }

  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
    })
    .onConflictDoNothing();

  await db
    .update(schema.invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitations.id, invitation.id));

  await recordEvent({
    workspaceId: invitation.workspaceId,
    actorUserId: userId,
    type: "member.joined",
    subjectType: "member",
    subjectId: userId,
    payload: { email: invitation.email, role: invitation.role },
  }).catch(() => {});

  const { sessionToken, expires } = await createUserSession(userId);
  await setSessionCookie(sessionToken, expires);

  redirect(`/${invitation.workspaceSlug}`);
}
