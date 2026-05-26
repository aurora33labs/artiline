import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

type Visibility = "internal_pw" | "internal" | "public_pw" | "public";

export type ArtifactAccess =
  | { kind: "ok" }
  | { kind: "needs_password" }
  | { kind: "needs_login" }
  | { kind: "not_member" }
  | { kind: "expired" }
  | { kind: "not_found" };

export type ArtifactRow = typeof schema.artifacts.$inferSelect;

export async function evaluateAccess(
  artifact: ArtifactRow | null,
  opts: {
    sessionUserId: string | null;
    passwordAttempt?: string | null;
  },
): Promise<ArtifactAccess> {
  if (!artifact) return { kind: "not_found" };
  if (artifact.expiresAt && artifact.expiresAt < new Date())
    return { kind: "expired" };

  const visibility = artifact.visibility as Visibility;
  const needsMember = visibility === "internal" || visibility === "internal_pw";
  const needsPw = visibility === "internal_pw" || visibility === "public_pw";

  if (needsMember || needsPw) {
    // Workspace members own the content: they bypass both the visibility and
    // password gates. The password gate exists only for non-member / external
    // viewers. This mirrors the internal artifact page, which grants access by
    // membership alone (requireMember) and never prompts members for a password.
    let isMember = false;
    if (opts.sessionUserId) {
      const [member] = await db
        .select({ userId: schema.workspaceMembers.userId })
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, artifact.workspaceId),
            eq(schema.workspaceMembers.userId, opts.sessionUserId),
          ),
        )
        .limit(1);
      isMember = !!member;
    }
    if (isMember) return { kind: "ok" };

    if (needsMember) {
      return opts.sessionUserId
        ? { kind: "not_member" }
        : { kind: "needs_login" };
    }

    // public_pw, non-member: enforce password
    if (!opts.passwordAttempt) return { kind: "needs_password" };
    if (!artifact.passwordHash) return { kind: "needs_password" };
    const ok = await bcrypt.compare(opts.passwordAttempt, artifact.passwordHash);
    if (!ok) return { kind: "needs_password" };
  }

  return { kind: "ok" };
}
