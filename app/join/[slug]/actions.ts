"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { auth } from "@/auth";
import { createUserSession, setSessionCookie } from "@/lib/auth-session";
import {
  type Bucket,
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailure,
} from "@/lib/rate-limit";
import { emailDomainAllowed } from "@/lib/join-requests";

const slugSchema = z
  .string()
  // slugs are interpolated into redirect paths — keep them path-safe.
  .regex(/^[a-z0-9-]{1,80}$/);

const guestSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

/**
 * Submit a request to join a workspace via its stable /join/<slug> link. Never
 * adds the user to `workspaceMembers` — that only happens when an owner/admin
 * approves. A logged-out visitor creates (or signs into) a password account here
 * first, mirroring the invite-accept flow, so the request is tied to a real user.
 */
export async function requestToJoin(formData: FormData) {
  const slug = slugSchema.parse(formData.get("slug"));

  const [workspace] = await db
    .select({
      id: schema.workspaces.id,
      slug: schema.workspaces.slug,
      joinRequestsEnabled: schema.workspaces.joinRequestsEnabled,
      allowedEmailDomains: schema.workspaces.allowedEmailDomains,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, slug))
    .limit(1);

  if (!workspace || !workspace.joinRequestsEnabled) redirect(`/join/${slug}`);

  const session = await auth();
  let userId: string;
  let email: string;

  if (session?.user?.id) {
    userId = session.user.id;
    email = (session.user.email ?? "").toLowerCase();
    if (!emailDomainAllowed(email, workspace.allowedEmailDomains))
      redirect(`/join/${slug}?error=domain`);

    // Already a member? Nothing to request.
    const [member] = await db
      .select({ userId: schema.workspaceMembers.userId })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspace.id),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member) redirect(`/${workspace.slug}`);
  } else {
    const data = guestSchema.parse({
      email: formData.get("email"),
      name: formData.get("name"),
      password: formData.get("password"),
    });
    email = data.email.toLowerCase();
    if (!emailDomainAllowed(email, workspace.allowedEmailDomains))
      redirect(`/join/${slug}?error=domain`);

    const [existing] = await db
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    const ip = await getClientIp();

    if (existing) {
      // Passwordless accounts (magic link / SSO) can't be authenticated by a
      // password here — send them to sign in with their own method first.
      if (!existing.passwordHash) redirect(`/login?error=needsignin`);

      const buckets: Bucket[] = [
        { key: email, kind: "join-email", limit: 5, windowMin: 15 },
      ];
      if (ip) buckets.push({ key: ip, kind: "join-ip", limit: 20, windowMin: 15 });
      if ((await isRateLimited(buckets)).limited)
        redirect(`/join/${slug}?error=throttled`);

      const ok = await bcrypt.compare(data.password, existing.passwordHash);
      if (!ok) {
        await recordFailure(buckets);
        redirect(`/join/${slug}?error=badpw`);
      }
      await clearAttempts(buckets);
      userId = existing.id;
    } else {
      // Untrusted self-serve account creation: the email is self-asserted (unlike
      // invite-accept, where an admin fixed it). Cap new accounts per IP so this
      // link can't be used to bulk-squat arbitrary emails, and leave
      // `emailVerified` null — nothing here proves the requester owns the address;
      // the admin-approval step is the human check before any access is granted.
      const signupBuckets: Bucket[] = ip
        ? [{ key: ip, kind: "join-signup", limit: 5, windowMin: 60 }]
        : [];
      if (signupBuckets.length && (await isRateLimited(signupBuckets)).limited)
        redirect(`/join/${slug}?error=throttled`);

      const [created] = await db
        .insert(schema.users)
        .values({
          email,
          name: data.name,
          passwordHash: await bcrypt.hash(data.password, 10),
          emailVerified: null,
        })
        .returning({ id: schema.users.id });
      userId = created.id;
      if (signupBuckets.length) await recordFailure(signupBuckets);
    }

    const { sessionToken, expires } = await createUserSession(userId);
    await setSessionCookie(sessionToken, expires);
  }

  // Collapse repeat asks into one row; let a previously denied request be
  // resubmitted (denied -> pending) without disturbing approved ones.
  await db
    .insert(schema.joinRequests)
    .values({ workspaceId: workspace.id, userId, status: "pending" })
    .onConflictDoUpdate({
      target: [schema.joinRequests.workspaceId, schema.joinRequests.userId],
      set: { status: "pending", decidedByUserId: null, decidedAt: null },
      setWhere: eq(schema.joinRequests.status, "denied"),
    });

  redirect(`/join/${workspace.slug}`);
}
