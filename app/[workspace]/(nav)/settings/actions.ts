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
import { MAX_MAX_VERSIONS, MIN_MAX_VERSIONS } from "@/lib/versions";
import { defaultLocale } from "@/i18n/routing";

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
  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);
  await assertCanAddMember(workspace.id);

  const token = nanoid(32);
  await db.insert(schema.invitations).values({
    workspaceId: workspace.id,
    email: data.email.toLowerCase(),
    token,
    role: data.role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

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
  const { workspace, role } = await requireMemberPage(data.workspaceSlug);
  requireRolePage(role, ["owner", "admin"]);
  await db
    .delete(schema.invitations)
    .where(
      and(
        eq(schema.invitations.id, data.invitationId),
        eq(schema.invitations.workspaceId, workspace.id),
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
