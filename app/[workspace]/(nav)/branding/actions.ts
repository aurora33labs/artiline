"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireMember, requireRole } from "@/lib/tenant";
import { isFeatureEnabled } from "@/lib/license";

const updateSchema = z.object({
  workspaceSlug: z.string().min(1),
  logoUrl: z.string().max(500).optional().nullable(),
  primaryColor: z.string().max(64).optional().nullable(),
  brandName: z.string().max(100).optional().nullable(),
  hideFooterChip: z.union([z.literal("on"), z.literal(""), z.null()]).optional(),
});

export async function updateBranding(formData: FormData) {
  const data = updateSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    logoUrl: formData.get("logoUrl") || null,
    primaryColor: formData.get("primaryColor") || null,
    brandName: formData.get("brandName") || null,
    hideFooterChip: formData.get("hideFooterChip"),
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  if (!(await isFeatureEnabled("white_label", { workspaceId: workspace.id }))) {
    throw new Error("FEATURE_DISABLED");
  }

  await db
    .update(schema.workspaces)
    .set({
      branding: {
        logoUrl: data.logoUrl ?? undefined,
        primaryColor: data.primaryColor ?? undefined,
        brandName: data.brandName ?? undefined,
        hideFooterChip: data.hideFooterChip === "on",
      },
    })
    .where(eq(schema.workspaces.id, workspace.id));

  revalidatePath(`/${data.workspaceSlug}/branding`);
}

const addDomainSchema = z.object({
  workspaceSlug: z.string().min(1),
  hostname: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "ERR_INVALID_HOSTNAME"),
});

export async function addCustomDomain(formData: FormData) {
  const data = addDomainSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    hostname: String(formData.get("hostname") ?? "").toLowerCase().trim(),
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  if (!(await isFeatureEnabled("custom_domain", { workspaceId: workspace.id }))) {
    throw new Error("FEATURE_DISABLED");
  }

  const { provisionDomain } = await import("@/lib/cloud/custom-domain");
  const result = await provisionDomain(data.hostname);

  await db.insert(schema.workspaceDomains).values({
    workspaceId: workspace.id,
    hostname: data.hostname,
    status: result.status === "active" ? "verified" : "pending",
    sslStatus: result.status === "active" ? "active" : "pending",
    cloudflareHostnameId: result.hostnameId,
    verifiedAt: result.status === "active" ? new Date() : null,
  });

  revalidatePath(`/${data.workspaceSlug}/branding`);
}

const removeDomainSchema = z.object({
  workspaceSlug: z.string().min(1),
  domainId: z.string().min(1),
});

export async function removeCustomDomain(formData: FormData) {
  const data = removeDomainSchema.parse({
    workspaceSlug: formData.get("workspaceSlug"),
    domainId: formData.get("domainId"),
  });

  const { workspace, role } = await requireMember(data.workspaceSlug);
  requireRole(role, ["owner", "admin"]);

  const [row] = await db
    .select()
    .from(schema.workspaceDomains)
    .where(
      and(
        eq(schema.workspaceDomains.id, data.domainId),
        eq(schema.workspaceDomains.workspaceId, workspace.id),
      ),
    )
    .limit(1);

  if (!row) return;

  if (row.cloudflareHostnameId) {
    const { deleteDomain } = await import("@/lib/cloud/custom-domain");
    await deleteDomain(row.cloudflareHostnameId).catch(() => {});
  }

  await db
    .delete(schema.workspaceDomains)
    .where(eq(schema.workspaceDomains.id, data.domainId));

  revalidatePath(`/${data.workspaceSlug}/branding`);
}
