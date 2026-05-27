"use server";

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db, schema } from "@/lib/db";
import { requireMember, requireRole } from "@/lib/tenant";
import { assertCanAddMember } from "@/lib/limits";
import { defaultLocale } from "@/i18n/routing";

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
  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);
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
  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);
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

const removeSchema = z.object({
  workspaceSlug: z.string().min(1),
  userId: z.string().min(1),
});

export async function removeMember(formData: FormData) {
  const data = removeSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    userId: formData.get("userId"),
  });
  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);
  if (data.userId === workspace.ownerUserId)
    throw new Error("ERR_CANNOT_REMOVE_OWNER");
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
