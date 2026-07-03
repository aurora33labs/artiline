"use server";

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import {
  memberManagementRights,
  requireMemberPage,
  requireRolePage,
} from "@/lib/tenant";
import { assertCanAddMember } from "@/lib/limits";
import { recordEvent } from "@/lib/activity";
import { MAX_MAX_VERSIONS, MIN_MAX_VERSIONS } from "@/lib/versions";
import { defaultLocale } from "@/i18n/routing";
import { parseAllowedDomains } from "@/lib/join-requests";
import { listAddableUsers } from "@/lib/members";

const maxVersionsSchema = z.object({
  workspaceSlug: z.string().min(1),
  maxVersions: z.coerce
    .number()
    .int()
    .min(MIN_MAX_VERSIONS)
    .max(MAX_MAX_VERSIONS),
});

/** Owner-only: set how many versions per artifact are retained before pruning. */
export async function updateMaxVersions(formData: FormData) {
  const data = maxVersionsSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    maxVersions: formData.get("maxVersions"),
  });
  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner"]);
  await db
    .update(schema.workspaces)
    .set({ maxVersions: data.maxVersions })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";
const KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.AUTH_URL ?? "http://localhost:3000";

const inviteSchema = z.object({
  workspaceSlug: z.string().min(1),
  email: z.email(),
  role: z.enum(["admin", "member"]),
});

export async function inviteMember(formData: FormData) {
  const data = inviteSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    email: formData.get("email"),
    role: formData.get("role") || "member",
  });
  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);
  await assertCanAddMember(workspace.id);

  const token = nanoid(32);
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      workspaceId: workspace.id,
      email: data.email.toLowerCase(),
      token,
      role: data.role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: schema.invitations.id });

  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "member.invited",
    subjectType: "invitation",
    subjectId: invitation.id,
    payload: { email: data.email.toLowerCase(), role: data.role },
  }).catch(() => {});

  const acceptUrl = `${APP_URL}/invite/${token}`;
  if (KEY) {
    const t = await getTranslations({ locale: defaultLocale, namespace: "emails.invitation" });
    const resend = new Resend(KEY);
    await resend.emails.send({
      from: FROM,
      to: data.email,
      subject: t("subject", { workspace: workspace.name }),
      html: `<p>${t("body", { workspace: `<strong>${workspace.name}</strong>` })}</p><p><a href="${acceptUrl}">${t("acceptCta")}</a></p>`,
    });
  } else {
    console.log(
      `\n=== Invitación para ${data.email} ===\n${acceptUrl}\n=====================================\n`,
    );
  }

  revalidatePath(`/${data.workspaceSlug}/settings`);
}

const revokeSchema = z.object({
  workspaceSlug: z.string().min(1),
  invitationId: z.string().min(1),
});

export async function revokeInvitation(formData: FormData) {
  const data = revokeSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    invitationId: formData.get("invitationId"),
  });
  const { session, workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);
  await db
    .delete(schema.invitations)
    .where(
      and(
        eq(schema.invitations.id, data.invitationId),
        eq(schema.invitations.workspaceId, workspace.id),
      ),
    );
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "invitation.revoked",
    subjectType: "invitation",
    subjectId: data.invitationId,
    payload: {},
  }).catch(() => {});
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

const addExistingSchema = z.object({
  workspaceSlug: z.string().min(1),
  role: z.enum(["admin", "member"]),
  userIds: z.array(z.string().min(1)).min(1),
});

/**
 * Owner/admin: add users who already have an account to this workspace directly,
 * no invite + no acceptance. Candidates are restricted to people who already
 * share a workspace with the actor (recomputed here — never trust client ids),
 * so this can't enumerate or add arbitrary accounts. Seat quota still applies.
 */
export async function addExistingMembers(formData: FormData) {
  const data = addExistingSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    role: formData.get("role") || "member",
    userIds: formData.getAll("userIds").map(String),
  });
  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );
  requireRolePage(role, ["owner", "admin"]);

  // Re-derive the allowed set server-side; ignore any id outside it.
  const addable = await listAddableUsers(session.user.id, workspace.id);
  const allowed = new Set(addable.map((u) => u.id));
  const toAdd = data.userIds.filter((id) => allowed.has(id));

  for (const userId of toAdd) {
    // Per-insert so the live member count enforces the seat cap in cloud;
    // no-op in OSS. Stop on LIMIT_MEMBERS, keeping whoever was already added.
    await assertCanAddMember(workspace.id);
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: workspace.id, userId, role: data.role })
      .onConflictDoNothing();
  }

  revalidatePath(`/${data.workspaceSlug}/settings`);
}

// --- Join requests (self-serve access) -------------------------------------

const joinPolicySchema = z.object({
  workspaceSlug: z.string().min(1),
  enabled: z.coerce.boolean(),
  domains: z.string().max(2000).optional(),
});

/** Owner/admin: toggle the /join link and set the optional allowed-domains list. */
export async function updateJoinPolicy(formData: FormData) {
  const data = joinPolicySchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    // an unchecked checkbox sends nothing → treat absence as false
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    domains: formData.get("domains") ?? "",
  });
  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);

  await db
    .update(schema.workspaces)
    .set({
      joinRequestsEnabled: data.enabled,
      allowedEmailDomains: parseAllowedDomains(data.domains ?? ""),
    })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

const joinDecisionSchema = z.object({
  workspaceSlug: z.string().min(1),
  requestId: z.string().min(1),
  role: z.enum(["admin", "member"]).optional(),
});

/** Owner/admin: approve a pending request → add the user as a workspace member. */
export async function approveJoinRequest(formData: FormData) {
  const data = joinDecisionSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    requestId: formData.get("requestId"),
    role: formData.get("role") || "member",
  });
  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );
  requireRolePage(role, ["owner", "admin"]);

  const [req] = await db
    .select({ id: schema.joinRequests.id, userId: schema.joinRequests.userId })
    .from(schema.joinRequests)
    .where(
      and(
        eq(schema.joinRequests.id, data.requestId),
        eq(schema.joinRequests.workspaceId, workspace.id),
        eq(schema.joinRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (!req) throw new Error("NOT_FOUND");

  await assertCanAddMember(workspace.id);

  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: workspace.id,
      userId: req.userId,
      role: data.role ?? "member",
    })
    .onConflictDoNothing();

  await db
    .update(schema.joinRequests)
    .set({
      status: "approved",
      decidedByUserId: session.user.id,
      decidedAt: new Date(),
    })
    .where(eq(schema.joinRequests.id, req.id));
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

/** Owner/admin: deny a pending request. The user keeps their account. */
export async function denyJoinRequest(formData: FormData) {
  const data = joinDecisionSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    requestId: formData.get("requestId"),
  });
  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );
  requireRolePage(role, ["owner", "admin"]);

  await db
    .update(schema.joinRequests)
    .set({
      status: "denied",
      decidedByUserId: session.user.id,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(schema.joinRequests.id, data.requestId),
        eq(schema.joinRequests.workspaceId, workspace.id),
        eq(schema.joinRequests.status, "pending"),
      ),
    );
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

/** Loads the target member's current role + email within the workspace. */
async function loadTargetMember(workspaceId: string, userId: string) {
  const [row] = await db
    .select({
      role: schema.workspaceMembers.role,
      email: schema.users.email,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return row;
}

const removeSchema = z.object({
  workspaceSlug: z.string().min(1),
  userId: z.string().min(1),
  confirmEmail: z.string().min(1),
});

export async function removeMember(formData: FormData) {
  const data = removeSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    userId: formData.get("userId"),
    confirmEmail: formData.get("confirmEmail"),
  });
  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );
  requireRolePage(role, ["owner", "admin"]);
  if (data.userId === workspace.ownerUserId)
    throw new Error("ERR_CANNOT_REMOVE_OWNER");

  const target = await loadTargetMember(workspace.id, data.userId);
  if (!target) throw new Error("NOT_FOUND");

  const { canRemove } = memberManagementRights({
    actorUserId: session.user.id,
    actorRole: role,
    ownerUserId: workspace.ownerUserId,
    targetUserId: data.userId,
    targetRole: target.role,
  });
  if (!canRemove) throw new Error("FORBIDDEN");

  // The typed email must match the member's — defense in depth so a crafted
  // request can't skip the confirmation the UI enforces.
  if (
    data.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()
  )
    throw new Error("ERR_EMAIL_MISMATCH");

  await db
    .delete(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.id),
        eq(schema.workspaceMembers.userId, data.userId),
      ),
    );
  await recordEvent({
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    type: "member.removed",
    subjectType: "member",
    subjectId: data.userId,
    payload: { email: target.email },
  }).catch(() => {});
  revalidatePath(`/${data.workspaceSlug}/settings`);
}

const changeRoleSchema = z.object({
  workspaceSlug: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

export async function changeMemberRole(formData: FormData) {
  const data = changeRoleSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  const { session, workspace, role } = await requireMemberPage(
    data.workspaceSlug,
  );
  requireRolePage(role, ["owner", "admin"]);

  const target = await loadTargetMember(workspace.id, data.userId);
  if (!target) throw new Error("NOT_FOUND");

  const { assignableRoles } = memberManagementRights({
    actorUserId: session.user.id,
    actorRole: role,
    ownerUserId: workspace.ownerUserId,
    targetUserId: data.userId,
    targetRole: target.role,
  });
  if (!assignableRoles.includes(data.role)) throw new Error("FORBIDDEN");

  await db
    .update(schema.workspaceMembers)
    .set({ role: data.role })
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.id),
        eq(schema.workspaceMembers.userId, data.userId),
      ),
    );
  revalidatePath(`/${data.workspaceSlug}/settings`);
}
